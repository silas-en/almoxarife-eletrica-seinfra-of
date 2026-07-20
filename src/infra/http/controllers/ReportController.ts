import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun } from 'docx';
import { startOfWeek, endOfWeek, format, subDays, startOfDay, endOfDay, parse, startOfMonth, endOfMonth, startOfYear, endOfYear, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { StorageService } from '../../storage/StorageService.ts';

export class ReportController {
  static async getAvailablePeriods(req: AuthRequest, res: Response) {
    try {
      const { range = 'weekly' } = req.query;
      
      // Use January 1st, 2026 as the minimum start date
      const minStartDate = new Date(2026, 0, 1);
      const oldestDemand = await prisma.demand.findFirst({
        where: { date: { gte: minStartDate } },
        orderBy: { date: 'asc' },
        select: { date: true }
      });

      // If no demands after 2026, or oldest demand is after 2026, use the later of the two
      let startDate = minStartDate;
      if (oldestDemand && oldestDemand.date > minStartDate) {
        startDate = startOfDay(oldestDemand.date);
      }
      
      const now = new Date();
      const endDate = endOfDay(now);

      let intervals: { start: Date; end: Date }[] = [];

      if (range === 'monthly') {
        const months = eachMonthOfInterval({ start: startDate, end: endDate });
        intervals = months.map(m => ({
          start: startOfDay(startOfMonth(m)),
          end: endOfDay(endOfMonth(m))
        }));
      } else if (range === 'yearly') {
        const years = eachYearOfInterval({ start: startDate, end: endDate });
        intervals = years.map(y => ({
          start: startOfDay(startOfYear(y)),
          end: endOfDay(endOfYear(y))
        }));
      } else {
        // Weekly
        const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 0 });
        intervals = weeks.map(w => ({
          start: startOfDay(startOfWeek(w, { weekStartsOn: 0 })),
          end: endOfDay(endOfWeek(w, { weekStartsOn: 0 }))
        }));
      }

      intervals.reverse();

      const savedReports = await prisma.report.findMany({
        where: { type: (range as string).toUpperCase() as any }
      });

      // Fetch all concluded demands once for performance
      const allDemandDates = await prisma.demand.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: 'CONCLUDED'
        },
        select: { date: true }
      });

      const periods = intervals.map(interval => {
        const isSaved = savedReports.some(sr => 
          sr.startDate.getTime() === interval.start.getTime() && 
          sr.endDate.getTime() === interval.end.getTime()
        );

        const demandCount = allDemandDates.filter(d => 
          d.date >= interval.start && d.date <= interval.end
        ).length;

        const reportId = savedReports.find(sr => 
          sr.startDate.getTime() === interval.start.getTime() && 
          sr.endDate.getTime() === interval.end.getTime()
        )?.id;

        return {
          start: format(interval.start, 'dd/MM/yyyy'),
          end: format(interval.end, 'dd/MM/yyyy'),
          referenceDate: interval.start.toISOString(),
          isSaved,
          reportId,
          demandCount
        };
      });

      res.json(periods);
    } catch (error) {
      console.error('[ReportController.getAvailablePeriods] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getReportData(req: AuthRequest, res: Response) {
    try {
      const { range = 'weekly', date } = req.query;
      // We parse the ISO date directly to maintain the exactly same reference point
      const referenceDate = date ? new Date(String(date)) : startOfDay(new Date());
      
      let startRange, endRange;

      if (range === 'monthly') {
        startRange = startOfDay(startOfMonth(referenceDate));
        endRange = endOfDay(endOfMonth(referenceDate));
      } else if (range === 'yearly') {
        startRange = startOfDay(startOfYear(referenceDate));
        endRange = endOfDay(endOfYear(referenceDate));
      } else {
        // Weekly default
        startRange = startOfDay(startOfWeek(referenceDate, { weekStartsOn: 0 }));
        endRange = endOfDay(endOfWeek(referenceDate, { weekStartsOn: 0 }));
      }

      console.log(`[ReportController.getReportData] Filtering from ${startRange.toISOString()} to ${endRange.toISOString()}`);

      const demands = await prisma.demand.findMany({
        where: {
          date: { gte: startRange, lte: endRange },
          status: 'CONCLUDED'
        },
        include: {
          electricians: { select: { id: true, name: true } },
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'asc' }
      });

      const mappedDemands = await StorageService.expandDemands(demands.map(d => StorageService.mapDemand(d)));

      const grouped = mappedDemands.reduce((acc: any, demand: any) => {
        if (demand.electricians && demand.electricians.length > 0) {
          demand.electricians.forEach((e: any) => {
            const name = e.name;
            if (!acc[name]) acc[name] = [];
            acc[name].push(demand);
          });
        } else {
          // Fallback group for demands without linked user (audit integrity)
          const name = "Não Atribuído / Outros";
          if (!acc[name]) acc[name] = [];
          acc[name].push(demand);
        }
        return acc;
      }, {});

      const standaloneRecovered = await prisma.returnedMaterial.findMany({
        where: {
          demandId: null,
          type: 'RECOVERED',
          date: { gte: startRange, lte: endRange }
        },
        include: { material: true }
      });

      const mappedRecovered = standaloneRecovered.map(r => ({
        ...r,
        material: r.material ? StorageService.mapMaterial(r.material) : r.material
      }));

      const savedReport = await prisma.report.findFirst({
        where: {
          type: (range as string).toUpperCase() as any,
          startDate: startRange,
          endDate: endRange
        }
      });

      res.json({
        period: {
          type: range,
          start: format(startRange, 'dd/MM/yyyy'),
          end: format(endRange, 'dd/MM/yyyy'),
          referenceDate: startRange.toISOString(),
        },
        data: grouped,
        demandsCount: demands.length,
        recovered: mappedRecovered,
        isSaved: !!savedReport,
        savedId: savedReport?.id
      });
    } catch (error) {
      console.error('[ReportController.getReportData] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async listReportsHistory(req: AuthRequest, res: Response) {
    try {
      const reports = await prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        include: { generatedBy: { select: { name: true } } }
      });
      res.json(reports);
    } catch (error) {
      console.error('[ReportController.listReportsHistory] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async saveReport(req: AuthRequest, res: Response) {
    try {
      const { type, startDate, endDate, referenceDate } = req.body;

      if (!type || !startDate || !endDate) {
        return res.status(400).json({ error: 'Missing required report fields' });
      }

      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));

      // Avoid duplicates for same period
      let report = await prisma.report.findFirst({
        where: {
          type: type as any,
          startDate: start,
          endDate: end
        }
      });

      if (!report) {
        report = await prisma.report.create({
          data: {
            type: type as any,
            startDate: start,
            endDate: end,
            referenceDate: referenceDate ? new Date(referenceDate) : new Date(),
            generatedById: req.user!.id
          }
        });
      }

      res.json(report);
    } catch (error) {
      console.error('[ReportController.saveReport] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteReport(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const report = await prisma.report.findUnique({
        where: { id }
      });

      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      await prisma.report.delete({
        where: { id }
      });

      res.status(204).send();
    } catch (error) {
      console.error('[ReportController.deleteReport] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async downloadPdf(req: AuthRequest, res: Response) {
    console.log('[ReportController.downloadPdf] Starting PDF generation sequence...');
    try {
      const { start, end, range = 'weekly' } = req.query;
      console.log(`[ReportController.downloadPdf] Params: start=${start}, end=${end}, range=${range}`);
      
      if (!start || !end) {
        console.error('[ReportController.downloadPdf] Missing start or end dates');
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      // Robust date parsing using date-fns/parse to ensure DD/MM/YYYY consistency across environments
      console.log('[ReportController.downloadPdf] Parsing dates...');
      const weekStart = startOfDay(parse(start as string, 'dd/MM/yyyy', new Date()));
      const weekEnd = endOfDay(parse(end as string, 'dd/MM/yyyy', new Date()));
      
      const reportTitle = range === 'yearly' ? 'RELATÓRIO ANUAL' : range === 'monthly' ? 'RELATÓRIO MENSAL' : 'RELATÓRIO SEMANAL';

      if (isNaN(weekStart.getTime()) || isNaN(weekEnd.getTime())) {
        console.error('[ReportController.downloadPdf] Invalid date format detected');
        return res.status(400).json({ error: 'Invalid date format. Use dd/MM/yyyy' });
      }

      console.log(`[ReportController.downloadPdf] Fetching demands from ${weekStart.toISOString()} to ${weekEnd.toISOString()}...`);
      const rawDemands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: 'CONCLUDED'
        },
        include: {
          electricians: true,
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'asc' }
      });
      const demands = await StorageService.expandDemands(rawDemands.map(d => StorageService.mapDemand(d)));
      console.log(`[ReportController.downloadPdf] Found ${demands.length} demands.`);

      const standaloneRecovered = await prisma.returnedMaterial.findMany({
        where: {
          demandId: null,
          type: 'RECOVERED',
          date: { gte: weekStart, lte: weekEnd }
        },
        include: { material: true }
      });
      console.log(`[ReportController.downloadPdf] Found ${standaloneRecovered.length} standalone recovered items.`);

      // Initialize PDFKit document in memory
      // Note: We avoid Puppeteer/Chromium entirely here for better stability on Render.
      // PDFKit is a pure-JS generator that doesn't require complex browser setups.
      const doc = new PDFDocument({ 
        margin: 50,
        info: {
          Title: `${reportTitle} de Manutenção Elétrica`,
          Author: 'SISTEMA SEINFRA',
        }
      });

      // Buffer collection strategy for Render stability (avoids partial response failures)
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      
      const pdfGenerationPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', err => {
          console.error('[ReportController.pdfGenerationPromise] Stream error:', err);
          reject(err);
        });
      });

      try {
        console.log('[ReportController.downloadPdf] Loading fonts and assets...');
        
        // --- RESOLVE FONT PATHS ---
        const isProd = process.env.NODE_ENV === 'production';
        const projectRoot = process.cwd();
        
        // In production, esbuild bundle is at dist/server.cjs. 
        // We copy src/assets/fonts to dist/assets/fonts.
        const fontsBaseDir = isProd 
          ? path.resolve(projectRoot, 'dist/assets/fonts')
          : path.resolve(projectRoot, 'src/assets/fonts');

        const regularPath = path.join(fontsBaseDir, 'Roboto-Regular.ttf');
        const boldPath = path.join(fontsBaseDir, 'Roboto-Bold.ttf');
        const italicPath = path.join(fontsBaseDir, 'Roboto-Italic.ttf');

        console.log(`[ReportController.downloadPdf] Environment: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
        console.log(`[ReportController.downloadPdf] Fonts Directory: ${fontsBaseDir}`);

        // Register fonts from filesystem
        try {
          if (!fs.existsSync(regularPath)) throw new Error(`Font not found: ${regularPath}`);
          if (!fs.existsSync(boldPath)) throw new Error(`Font not found: ${boldPath}`);
          if (!fs.existsSync(italicPath)) throw new Error(`Font not found: ${italicPath}`);

          doc.registerFont('AppFont', regularPath);
          doc.registerFont('AppFont-Bold', boldPath);
          doc.registerFont('AppFont-Italic', italicPath);
          console.log('[ReportController.downloadPdf] Local fonts registered successfully.');
        } catch (fontRegError) {
          console.error('[ReportController.downloadPdf] Font Registration Failed:', fontRegError);
          // If fonts fail to register, pdfkit might try to load its default Helvetica and hit the ENOENT error.
          // We throw an error early to avoid 500 with cryptic ENOENT.
          throw new Error(`Dependência de fonte não encontrada no servidor: ${fontRegError instanceof Error ? fontRegError.message : String(fontRegError)}`);
        }

        const fontRegular = 'AppFont';
        const fontBold = 'AppFont-Bold';
        const fontItalic = 'AppFont-Italic';

        // --- LOAD LOGO ---
        const [logoRes] = await Promise.allSettled([
          axios.get('https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png', { responseType: 'arraybuffer', timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } })
        ]);
        doc.rect(0, 0, 612, 180).fill('#FFFFFF');
        
        if (logoRes.status === 'fulfilled') {
          doc.image(logoRes.value.data, 236, 30, { width: 140 });
        }

        doc.fillColor('#0f172a').font(fontBold).fontSize(26).text(reportTitle, 0, 155, { align: 'center', characterSpacing: 1 });
        doc.fontSize(16).text('ALMOXARIFADO DE MANUTENÇÃO ELÉTRICA', 0, 190, { align: 'center', characterSpacing: 0.5 });
        
        doc.fillColor('#475569').font(fontBold).fontSize(14).text(`PERÍODO: ${start} À ${end}`, 0, 240, { align: 'center' });
        doc.rect(180, 265, 252, 3).fill('#0284c7');
        
        doc.fillColor('#64748b').font(fontRegular).fontSize(11).text('SECRETARIA DE INFRAESTRUTURA - SEINFRA', 0, 710, { align: 'center' });
        doc.font(fontBold).fillColor('#0f172a').text(format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase(), 0, 730, { align: 'center' });
        
        doc.addPage();

        // --- CONTEÚDO DAS DEMANDAS ---
        const totals: any = { used: {}, returned: {}, recovered: {}, totalDemands: demands.length };
        
        standaloneRecovered.forEach((m: any) => {
          const key = m.materialId || `MANUAL-${m.materialName}`;
          if (!totals.recovered[key]) {
            totals.recovered[key] = { 
              name: m.material?.name || m.materialName, 
              unit: m.material?.unit || 'un', 
              quantity: 0 
            };
          }
          totals.recovered[key].quantity += m.quantity;
        });

        const materialDemandIds: Record<string, Set<string>> = {};

        // Pre-populate totals using unique demands to avoid double counting from multi-electrician demands
        demands.forEach((d: any) => {
          // Used materials
          d.usedMaterials?.forEach((um: any) => {
            const key = um.material.id;
            if (!totals.used[key]) {
              totals.used[key] = { name: um.material.name, unit: um.material.unit, quantity: 0, demandsCount: 0 };
            }
            totals.used[key].quantity += um.quantity;

            if (!materialDemandIds[key]) {
              materialDemandIds[key] = new Set<string>();
            }
            materialDemandIds[key].add(d.id);
          });

          // Defective/damaged materials
          const damaged = d.returnedMaterials?.filter((m: any) => m.type === 'DEFECTIVE') || [];
          damaged.forEach((m: any) => {
            const key = `DAMAGED-${m.material.id}`;
            if (!totals.returned[key]) {
              totals.returned[key] = { name: m.material.name, unit: m.material.unit, quantity: 0, type: 'Danificado' };
            }
            totals.returned[key].quantity += m.quantity;
          });

          // Recovered materials
          const recovered = d.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED') || [];
          recovered.forEach((m: any) => {
            const name = m.material?.name || m.materialName;
            const key = m.materialId || `MANUAL-${m.materialName}`;
            if (!totals.recovered[key]) {
              totals.recovered[key] = { name, unit: m.material?.unit || 'un', quantity: 0 };
            }
            totals.recovered[key].quantity += m.quantity;
          });
        });

        // Set demandsCount for used items
        Object.keys(totals.used).forEach((key) => {
          totals.used[key].demandsCount = materialDemandIds[key] ? materialDemandIds[key].size : 0;
        });

        doc.fillColor('#000000');
        const grouped = demands.reduce((acc: any, demand: any) => {
          demand.electricians.forEach((e: any) => {
            const name = e.name;
            if (!acc[name]) acc[name] = [];
            acc[name].push(demand);
          });
          return acc;
        }, {});

        for (const [electricianName, eDemands] of Object.entries(grouped) as any[]) {
          doc.rect(50, 40, 512, 30).fill('#f8fafc');
          doc.font(fontBold).fontSize(14).fillColor('#0284c7').text(`ELETRICISTA: ${electricianName.toUpperCase()}`, 60, 50);
          doc.moveDown(1.5);
          doc.fillColor('#000000');

          for (const d of eDemands) {
            if (doc.y > 600) doc.addPage();
            const startY = doc.y;
            doc.rect(50, startY, 512, 22).fill('#f1f5f9');
            
            const displayDate = d.date instanceof Date ? format(d.date, 'dd/MM/yyyy') : format(new Date(d.date), 'dd/MM/yyyy');
            doc.fillColor('#0f172a').font(fontBold).fontSize(11).text(`${displayDate} - ${d.location}`, 60, startY + 6);
            doc.moveDown(0.8);
            
            doc.fillColor('#334155').font(fontItalic).fontSize(10).text(`Descrição: ${d.description}`, { lineGap: 2 });
            doc.moveDown(0.5);

            doc.fillColor('#64748b').font(fontBold).fontSize(8).text('EQUIPE:', 60);
            doc.fillColor('#0f172a').font(fontRegular).fontSize(9).text(d.electricians.map((e: any) => e.name).join(', '), 110, doc.y - 9);
            doc.moveDown(0.4);

            const tableY = doc.y;
            doc.rect(50, tableY, 512, 15).fill('#334155');
            doc.fillColor('#FFFFFF').font(fontBold).fontSize(8);
            doc.text('DESCRIÇÃO DO MATERIAL', 60, tableY + 4);
            doc.text('PLANEJ.', 380, tableY + 4);
            doc.text('UTILIZ.', 430, tableY + 4);
            doc.text('SOBRA', 480, tableY + 4);
            doc.moveDown(0.8);

            const allMaterialIds = new Set([
              ...d.plannedMaterials.map((m: any) => m.materialId),
              ...d.usedMaterials.map((m: any) => m.materialId),
              ...d.returnedMaterials.map((m: any) => m.materialId)
            ]);

            doc.fillColor('#000000').font(fontRegular).fontSize(8);
            allMaterialIds.forEach((mId: any) => {
              if (doc.y > 750) {
                doc.addPage();
                const newTableY = doc.y;
                doc.rect(50, newTableY, 512, 15).fill('#334155');
                doc.fillColor('#FFFFFF').font(fontBold).fontSize(8);
                doc.text('DESCRIÇÃO DO MATERIAL (CONT.)', 60, newTableY + 4);
                doc.text('PLANEJ.', 380, newTableY + 4);
                doc.text('UTILIZ.', 430, newTableY + 4);
                doc.text('SOBRA', 480, newTableY + 4);
                doc.moveDown(0.8);
                doc.fillColor('#000000').font(fontRegular).fontSize(8);
              }

              const pm = d.plannedMaterials.find((m: any) => m.materialId === mId);
              const um = d.usedMaterials.find((m: any) => m.materialId === mId);
              const rm = d.returnedMaterials.find((m: any) => m.materialId === mId && m.type === 'NOT_USED');
              const material = pm?.material || um?.material || rm?.material;

              const lineY = doc.y;
              doc.text(material?.name || 'Material Desconhecido', 60, lineY);
              
              const isExclusiveSplitClone = d.plannedMaterials && d.plannedMaterials.length === 0;
              const plannedText = isExclusiveSplitClone ? '' : `${pm?.quantity || 0} ${material?.unit || ''}`;
              const usedText = `${um?.quantity || 0} ${material?.unit || ''}`;
              const surplusText = isExclusiveSplitClone ? '' : `${rm?.quantity || 0} ${material?.unit || ''}`;

              doc.text(plannedText, 380, lineY);
              doc.text(usedText, 430, lineY);
              doc.text(surplusText, 480, lineY);
              
              doc.moveDown(0.2);
            });

            const damaged = d.returnedMaterials.filter((m: any) => m.type === 'DEFECTIVE');
            if (damaged.length > 0) {
              doc.moveDown(0.4);
              doc.fillColor('#b91c1c').font(fontBold).fontSize(8).text('DANIFICADOS/DEFEITUOSOS:', 60);
              damaged.forEach((m: any) => {
                doc.font(fontRegular).fontSize(8).text(`• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, 70);

              });
            }

            const recovered = d.returnedMaterials.filter((m: any) => m.type === 'RECOVERED');
            if (recovered.length > 0) {
              doc.moveDown(0.4);
              doc.fillColor('#15803d').font(fontBold).fontSize(8).text('MATERIAIS RECUPERADOS:', 60);
              recovered.forEach((m: any) => {
                const name = m.material?.name || m.materialName;
                doc.font(fontRegular).fontSize(8).text(`• ${m.quantity} ${m.material?.unit || 'un'} - ${name}`, 70);

              });
            }

            const resources = [];
            if (d.vehicles && d.vehicles.length > 0) resources.push(`Veículos: ${d.vehicles.join(', ')}`);
            if (resources.length > 0) {
              doc.moveDown(0.4);
              doc.fillColor('#0284c7').font(fontBold).fontSize(8).text('RECURSOS UTILIZADOS:', 60);
              resources.forEach(r => doc.fillColor('#0f172a').font(fontRegular).fontSize(8).text(`• ${r}`, 70));
            }

            doc.moveDown(1.5);
            doc.rect(50, doc.y, 512, 0.5).fill('#e2e8f0');
            doc.moveDown(1);
          }
          doc.addPage();
        }

        // --- DASHBOARD DE RESUMO GERAL ---
        doc.rect(0, 0, 612, 100).fill('#FFFFFF');
        const reportSubTitle = range === 'yearly' ? 'DASHBOARD ANUAL' : range === 'monthly' ? 'DASHBOARD MENSAL' : 'DASHBOARD SEMANAL';
        doc.fillColor('#0f172a').font(fontBold).fontSize(18).text(`${reportSubTitle} - INTELIGÊNCIA OPERACIONAL`, 0, 40, { align: 'center' });
        doc.rect(150, 70, 312, 2).fill('#0284c7');
        
        const dashY = 120;
        doc.fillColor('#0f172a').font(fontBold).fontSize(12).text('INDICADORES DE PERFORMANCE', 50, dashY);
        
        const boxWidth = 160;
        const spacing = 20;
        const startX = (612 - (boxWidth * 3 + spacing * 2)) / 2;

        doc.rect(startX, dashY + 20, boxWidth, 60).fill('#f1f5f9');
        doc.fillColor('#64748b').fontSize(8).text('TOTAL DE DEMANDAS', startX + 10, dashY + 30);
        doc.fillColor('#0f172a').fontSize(20).text(String(totals.totalDemands), startX + 10, dashY + 45);

        let itemsUsed = 0;
        demands.forEach((d: any) => {
          d.usedMaterials?.forEach((um: any) => {
            const unit = um.material?.unit?.toLowerCase();
            const isMeters = unit === 'm' || unit === 'metros' || unit === 'metro' || unit === 'metro(s)';
            if (isMeters) {
              itemsUsed += 1;
            } else {
              itemsUsed += um.quantity;
            }
          });
        });

        doc.rect(startX + boxWidth + spacing, dashY + 20, boxWidth, 60).fill('#f1f5f9');
        doc.fillColor('#64748b').fontSize(8).text('TOTAL ITENS UTILIZADOS', startX + boxWidth + spacing + 10, dashY + 30);
        doc.fillColor('#0284c7').fontSize(20).text(String(itemsUsed), startX + boxWidth + spacing + 10, dashY + 45);

        let itemsRecovered = 0;
        demands.forEach((d: any) => {
          const recovered = d.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED') || [];
          recovered.forEach((m: any) => {
            const unit = m.material?.unit?.toLowerCase();
            const isMeters = unit === 'm' || unit === 'metros' || unit === 'metro' || unit === 'metro(s)';
            if (isMeters) {
              itemsRecovered += 1;
            } else {
              itemsRecovered += m.quantity;
            }
          });
        });
        standaloneRecovered.forEach((m: any) => {
          const unit = m.material?.unit?.toLowerCase();
          const isMeters = unit === 'm' || unit === 'metros' || unit === 'metro' || unit === 'metro(s)';
          if (isMeters) {
            itemsRecovered += 1;
          } else {
            itemsRecovered += m.quantity;
          }
        });

        doc.rect(startX + (boxWidth + spacing) * 2, dashY + 20, boxWidth, 60).fill('#f1f5f9');
        doc.fillColor('#64748b').fontSize(8).text('ITENS RECUPERADOS', startX + (boxWidth + spacing) * 2 + 10, dashY + 30);
        doc.fillColor('#15803d').fontSize(20).text(String(itemsRecovered), startX + (boxWidth + spacing) * 2 + 10, dashY + 45);

        doc.moveDown(6);

        if (itemsRecovered > 0) {
          doc.fillColor('#15803d').font(fontBold).fontSize(12).text('MATERIAIS RECUPERADOS NO PERÍODO', 50);
          doc.moveDown(1);
          Object.values(totals.recovered).forEach((m: any) => {
            doc.fillColor('#334155').font(fontRegular).fontSize(9).text(`• ${m.name}: `, 60, doc.y, { continued: true });
            doc.fillColor('#15803d').font(fontBold).text(`${m.quantity} ${m.unit || 'un'}`);
            doc.moveDown(0.3);
          });
          doc.moveDown(1.5);
        }

        doc.fillColor('#0f172a').font(fontBold).fontSize(12).text('CONSUMO POR CATEGORIA DE MATERIAL (TOP 10)', 50);
        doc.moveDown(1);
        const usedSorted = Object.values(totals.used).sort((a: any, b: any) => b.quantity - a.quantity).slice(0, 10);
        
        if (usedSorted.length > 0) {
          const chartX = 180;
          const chartWidth = 350;
          const barHeight = 15;
          const maxQty = Math.max(...usedSorted.map((m: any) => m.quantity)) || 1;

          usedSorted.forEach((m: any) => {
            const y = doc.y;
            doc.fillColor('#334155').font(fontRegular).fontSize(8).text(m.name, 50, y + 4, { width: 120, align: 'right' });
            doc.rect(chartX, y, chartWidth, barHeight).fill('#f1f5f9');
            const barWidth = Math.max(0, (m.quantity / maxQty) * chartWidth);
            doc.rect(chartX, y, barWidth, barHeight).fill('#0284c7');
            doc.fillColor('#FFFFFF').font(fontBold).fontSize(7).text(String(m.quantity), chartX + 5, y + 4);
            doc.moveDown(1.5);
          });
        } else {
          doc.font(fontRegular).fontSize(10).text('Nenhum dado de material disponível para o gráfico.', 50);
        }

        doc.moveDown(2);
        if (usedSorted.length > 5) doc.addPage();
        
        doc.fillColor('#0f172a').font(fontBold).fontSize(12).text('DETALHAMENTO DE MATERIAIS UTILIZADOS', 50);
        doc.moveDown(1);
        
        const fullUsedSorted = Object.values(totals.used).sort((a: any, b: any) => a.name.localeCompare(b.name));
        fullUsedSorted.forEach((m: any) => {
          const lineY = doc.y;
          const unit = m.unit?.toLowerCase();
          const isMeters = unit === 'm' || unit === 'metros' || unit === 'metro' || unit === 'metro(s)';
          const qtyText = isMeters && m.demandsCount > 0 
            ? `${m.quantity} ${m.unit || 'un'} (em ${m.demandsCount} ${m.demandsCount === 1 ? 'demanda' : 'demandas'})`
            : `${m.quantity} ${m.unit || 'un'}`;

          doc.fillColor('#475569').font(fontRegular).fontSize(9).text(`• ${m.name}`, 60, lineY, { width: 330 });
          doc.fillColor('#0f172a').font(fontBold).fontSize(9).text(qtyText, 400, lineY, { align: 'right', width: 160 });
          doc.moveDown(0.3);
          if (doc.y > 680) doc.addPage();
        });

        doc.font(fontRegular).fontSize(10);
        const signY = 700;
        doc.text('__________________________', 50, signY, { width: 150, align: 'center' });
        doc.text('COORDENADOR DE ELETRICIDADE', 50, signY + 15, { width: 150, align: 'center' });
        doc.text('__________________________', 230, signY, { width: 150, align: 'center' });
        doc.text('SECRETÁRIO DE INFRA', 230, signY + 15, { width: 150, align: 'center' });
        doc.text('__________________________', 410, signY, { width: 150, align: 'center' });
        doc.text('ALMOXARIFE / RESPONSÁVEL', 410, signY + 15, { width: 150, align: 'center' });

        doc.end();
        console.log('[ReportController.downloadPdf] PDF generation finished, waiting for buffer...');
        
        const finalBuffer = await pdfGenerationPromise;
        console.log(`[ReportController.downloadPdf] Sending PDF buffer: ${finalBuffer.length} bytes`);
        
        const safeStart = (start as string).replace(/\//g, '-');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-${range}-${safeStart}.pdf`);
        res.send(finalBuffer);
        
      } catch (pdfError) {
        console.error('[ReportController.downloadPdf] Critical error during PDF layout/generation:', pdfError);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erro ao formatar o conteúdo do PDF', details: String(pdfError) });
        }
      }
    } catch (error: any) {
      console.error('[ReportController.downloadPdf] Outer Controller Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Falha interna ao processar o relatório', 
          details: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
      }
    }
  }

  static async downloadDocx(req: AuthRequest, res: Response) {
    try {
      const { start, end, range = 'weekly' } = req.query;
      if (!start || !end) return res.status(400).json({ error: 'Start and end dates are required' });

      const weekStart = startOfDay(parse(start as string, 'dd/MM/yyyy', new Date()));
      const weekEnd = endOfDay(parse(end as string, 'dd/MM/yyyy', new Date()));

      const reportTitle = range === 'yearly' ? 'RELATÓRIO ANUAL' : range === 'monthly' ? 'RELATÓRIO MENSAL' : 'RELATÓRIO SEMANAL';

      const rawDemands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: 'CONCLUDED'
        },
        include: {
          electricians: true,
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'asc' }
      });
      const demands = await StorageService.expandDemands(rawDemands.map(d => StorageService.mapDemand(d)));

      const standaloneRecovered = await prisma.returnedMaterial.findMany({
        where: {
          demandId: null,
          type: 'RECOVERED',
          date: { gte: weekStart, lte: weekEnd }
        },
        include: { material: true }
      });

      const children: any[] = [
        new Paragraph({
          children: [
            new TextRun({
              text: `${reportTitle} ALMOXARIFADO ELÉTRICA - SEINFRA`,
              bold: true,
              size: 32,
              color: '0284c7'
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Período: ${start} a ${end}`,
              size: 24,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),
      ];

      const recoveredTotals: any = {};
      standaloneRecovered.forEach((m: any) => {
        const key = m.materialId || `MANUAL-${m.materialName}`;
        if (!recoveredTotals[key]) {
          recoveredTotals[key] = { 
            name: m.material?.name || m.materialName, 
            unit: m.material?.unit || 'un', 
            quantity: 0 
          };
        }
        recoveredTotals[key].quantity += m.quantity;
      });

      // Add demand info to DOCX
      demands.forEach(d => {
        // Collect info for summary
        d.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED').forEach((m: any) => {
          const key = m.materialId || `MANUAL-${m.materialName}`;
          if (!recoveredTotals[key]) {
            recoveredTotals[key] = { 
              name: m.material?.name || m.materialName, 
              unit: m.material?.unit || 'un', 
              quantity: 0 
            };
          }
          recoveredTotals[key].quantity += m.quantity;
        });

        const displayDate = d.date instanceof Date ? format(d.date, 'dd/MM/yyyy') : format(new Date(d.date), 'dd/MM/yyyy');
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `DATA: ${displayDate} - LOCAL: ${d.location}`, bold: true, size: 22 })
          ],
          spacing: { before: 200 }
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `DESCRIÇÃO: ${d.description}`, italics: true, size: 20 })]
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `EQUIPE: ${d.electricians.map((e: any) => e.name).join(', ')}`, size: 20 })]
        }));
        
        if (d.plannedMaterials && d.plannedMaterials.length > 0) {
          children.push(new Paragraph({ children: [new TextRun({ text: "MATERIAIS PLANEJADOS:", bold: true, size: 20 })], spacing: { before: 100 } }));
          d.plannedMaterials.forEach((m: any) => {
            children.push(new Paragraph({ children: [new TextRun({ text: `• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, size: 18 })] }));
          });
        }

        children.push(new Paragraph({ children: [new TextRun({ text: "MATERIAIS UTILIZADOS:", bold: true, size: 20 })], spacing: { before: 100 } }));
        d.usedMaterials.forEach((m: any) => {
          children.push(new Paragraph({ children: [new TextRun({ text: `• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, size: 18 })] }));
        });

        const surplus = d.returnedMaterials.filter((m: any) => m.type === 'NOT_USED');
        if (surplus.length > 0) {
          children.push(new Paragraph({ children: [new TextRun({ text: "MATERIAIS PARA RETORNO (SOBRA):", bold: true, size: 20 })], spacing: { before: 100 } }));
          surplus.forEach((m: any) => {
            children.push(new Paragraph({ children: [new TextRun({ text: `• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, size: 18 })] }));
          });
        }

        const resources = [];
        if (d.vehicles && d.vehicles.length > 0) resources.push(`Veículos: ${d.vehicles.join(', ')}`);
        if (resources.length > 0) {
          children.push(new Paragraph({ children: [new TextRun({ text: "RECURSOS UTILIZADOS:", bold: true, size: 20 })], spacing: { before: 100 } }));
          resources.forEach(r => {
            children.push(new Paragraph({ children: [new TextRun({ text: `• ${r}`, size: 18 })] }));
          });
        }

        children.push(new Paragraph({ children: [new TextRun({ text: "----------------------------------------------------" })], spacing: { before: 200, after: 200 } }));
      });

      const totalRecoveredList = Object.values(recoveredTotals);
      if (totalRecoveredList.length > 0) {
        children.push(new Paragraph({
          children: [new TextRun({ text: "MATERIAIS RECUPERADOS NA SEMANA (TOTAL):", bold: true, size: 24, color: '15803d' })],
          spacing: { before: 400, after: 200 }
        }));
        
        totalRecoveredList.forEach((m: any) => {
          children.push(new Paragraph({
            children: [new TextRun({ text: `• ${m.quantity} ${m.unit || 'un'} - ${m.name}`, size: 20 })]
          }));
        });
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      const safeStart = (start as string).replace(/\//g, '-');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-${range}-${safeStart}.docx`);
      res.send(buffer);
    } catch (error) {
      console.error('[ReportController.downloadDocx] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

