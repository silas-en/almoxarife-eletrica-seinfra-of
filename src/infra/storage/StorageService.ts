import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import prisma from '../database/prisma.ts';

const useSSL = process.env.MINIO_USE_SSL === 'true';
const rawEndpoint = process.env.MINIO_ENDPOINT || 'minioapi.serrinhaconectada.tech';
const accessKeyId = process.env.MINIO_ACCESS_KEY || '';
const secretAccessKey = process.env.MINIO_SECRET_KEY || '';

// Clean up endpoint to ensure it does not double-prefix, but S3Client needs the protocol prefixed
const endpointHost = rawEndpoint.replace(/^https?:\/\//, '');
const s3Endpoint = `${useSSL ? 'https' : 'http'}://${endpointHost}`;

const s3Client = new S3Client({
  endpoint: s3Endpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // Crucial for MinIO path-style bucket access
});

async function ensureBucket(bucket: string) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err: any) {
    // If bucket is not found or we get a 404, we try to create it
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`[StorageService] Bucket "${bucket}" not found. Creating...`);
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[StorageService] Successfully created bucket: ${bucket}`);
      } catch (createErr) {
        console.error(`[StorageService] Failed to create bucket "${bucket}":`, createErr);
      }
    } else {
      console.warn(`[StorageService] Error checking bucket "${bucket}":`, err);
    }
  }
}

export class StorageService {
  static getFileUrl(filePath: string | null | undefined): string | null {
    if (!filePath) return null;
    
    const publicUrl = process.env.MINIO_PUBLIC_URL || 'https://minioapi.serrinhaconectada.tech';
    const cleanPublicUrl = publicUrl.replace(/\/+$/, '');
    
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // For legacy DB paths referencing old complete URLs, rewrite them on-the-fly to the current MINIO_PUBLIC_URL
      try {
        const url = new URL(filePath);
        const pathParts = url.pathname.slice(1).split('/'); // ["service-photos", "services", ...]
        if (pathParts[0] === 'service-photos' || pathParts[0] === 'materials-images') {
          return `${cleanPublicUrl}/${url.pathname.replace(/^\/+/, '')}`;
        }
      } catch (e) {
        // Fallback to returning the original filePath unchanged
      }
      return filePath;
    }
    
    const cleanPath = filePath.replace(/^\/+/, '');
    return `${cleanPublicUrl}/${cleanPath}`;
  }

  static mapMaterial(material: any): any {
    if (!material) return material;
    return {
      ...material,
      imageUrl: StorageService.getFileUrl(material.imageUrl)
    };
  }

  static mapDemand(demand: any): any {
    if (!demand) return demand;

    let description = demand.description || '';
    let referencePhotoUrl = null;

    if (description.includes('###REF_PHOTO:')) {
      const parts = description.split('###REF_PHOTO:');
      description = parts[0];
      referencePhotoUrl = parts[1] || null;
    }

    let mappedPhotoUrl = null;
    if (demand.photoUrl) {
      if (demand.photoUrl.includes(',')) {
        mappedPhotoUrl = demand.photoUrl
          .split(',')
          .map((part: string) => StorageService.getFileUrl(part.trim()))
          .filter(Boolean)
          .join(',');
      } else {
        mappedPhotoUrl = StorageService.getFileUrl(demand.photoUrl);
      }
    }

    const mapped = {
      ...demand,
      description,
      photoUrl: mappedPhotoUrl,
      referencePhotoUrl: StorageService.getFileUrl(referencePhotoUrl)
    };
    
    if (mapped.plannedMaterials) {
      mapped.plannedMaterials = mapped.plannedMaterials.map((pm: any) => ({
        ...pm,
        material: pm.material ? StorageService.mapMaterial(pm.material) : pm.material
      }));
    }
    
    if (mapped.usedMaterials) {
      mapped.usedMaterials = mapped.usedMaterials.map((um: any) => ({
        ...um,
        material: um.material ? StorageService.mapMaterial(um.material) : um.material
      }));
    }
    
    if (mapped.returnedMaterials) {
      mapped.returnedMaterials = mapped.returnedMaterials.map((rm: any) => ({
        ...rm,
        material: rm.material ? StorageService.mapMaterial(rm.material) : rm.material
      }));
    }
    
    return mapped;
  }

  static async expandMaterialsList(items: any[], allMaterialsMap: Record<string, any>): Promise<any[]> {
    const expanded: any[] = [];

    for (const item of items) {
      const matId = item.materialId;
      const material = item.material || allMaterialsMap[matId];
      
      if (material && material.components) {
        let comps = material.components;
        if (typeof comps === 'string') {
          try {
            comps = JSON.parse(comps);
          } catch (e) {
            comps = null;
          }
        }
        if (Array.isArray(comps) && comps.length > 0) {
          for (const comp of comps) {
            const compMat = allMaterialsMap[comp.materialId];
            if (compMat) {
              expanded.push({
                ...item,
                id: `${item.id || 'un'}-${comp.materialId}`,
                materialId: comp.materialId,
                quantity: item.quantity * comp.quantity,
                material: compMat
              });
            }
          }
          continue;
        }
      }

      // Keep as is if not grouped or doesn't have components
      expanded.push({
        ...item,
        material: material
      });
    }

    // Merge duplicate materialIds to sum quantity nicely
    const merged: Record<string, any> = {};
    const externalOrManual: any[] = [];
    for (const item of expanded) {
      const key = item.materialId;
      if (!key) {
        externalOrManual.push(item);
        continue;
      }
      if (!merged[key]) {
        merged[key] = { ...item };
      } else {
        merged[key].quantity += item.quantity;
      }
    }

    return [...Object.values(merged), ...externalOrManual];
  }

  static async expandDemands(demands: any[]): Promise<any[]> {
    try {
      const allMaterials = await prisma.material.findMany();
      const allMaterialsMap: Record<string, any> = {};
      allMaterials.forEach(m => {
        allMaterialsMap[m.id] = StorageService.mapMaterial(m);
      });

      const expandedDemands = [];
      for (const d of demands) {
        const plannedMaterials = await StorageService.expandMaterialsList(d.plannedMaterials || [], allMaterialsMap);
        const usedMaterials = await StorageService.expandMaterialsList(d.usedMaterials || [], allMaterialsMap);
        const returnedMaterials = await StorageService.expandMaterialsList(d.returnedMaterials || [], allMaterialsMap);

        expandedDemands.push({
          ...d,
          plannedMaterials,
          usedMaterials,
          returnedMaterials
        });
      }
      return expandedDemands;
    } catch (e) {
      console.error('[StorageService.expandDemands] Error expanding demands:', e);
      return demands;
    }
  }

  static async uploadFile(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      // Sanitize key by replacing safety-compromising elements in individual segments
      const cleanKey = key
        .split('/')
        .map(segment => segment.replace(/[\s()]/g, '_'))
        .join('/');

      console.log(`[StorageService.uploadFile] Starting upload to MinIO. Bucket: ${bucket}, Key: ${cleanKey}`);

      // Auto-ensure bucket exists on upload
      await ensureBucket(bucket);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType,
      });

      await s3Client.send(command);

      // We explicitly record only the relative path `bucket/key` down in our database
      const relativePath = `${bucket}/${cleanKey}`;

      console.log(`[StorageService.uploadFile] Upload completed successfully. Relative Path: ${relativePath}`);
      return relativePath;
    } catch (error) {
      console.error('[StorageService.uploadFile] Error uploading file to MinIO:', error);
      throw error;
    }
  }
}
