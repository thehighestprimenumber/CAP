import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { getReductionPotential, toTitleCase } from './helpers';

const convertToCSV = (data) => {
  if (!data || !data.length) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        let cell = row[header] ?? '';
        if (cell.toString().includes(',')) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(',')
    )
  ];

  return csvRows.join('\n');
};

export const exportToCSV = (data, filename) => {
  const csv = convertToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, filename);
};

const generatePdfReport = (cityName, ccraData, qualitativeScore, customRiskLevels) => {
  const doc = new jsPDF();
  let currentY = 20;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;
  const pageHeight = doc.internal.pageSize.height;

  // Helper functions
  const addNewPage = () => {
    doc.addPage();
    currentY = 20;
  };

  const checkForNewPage = (requiredSpace) => {
    if (currentY + requiredSpace > pageHeight - margin) {
      addNewPage();
    }
  };

  const calculateAdjustedVulnerability = (row, resilienceScore) => {
    if (!resilienceScore) return row["Vulnerability Score"];
    const sensitivity = row["Sensitivity Score"];
    return sensitivity * (1 - resilienceScore);
  };

  const calculateAdjustedRiskScore = (row, resilienceScore) => {
    if (!resilienceScore) return row["Risk Score"];
    const hazardScore = row["Climate Threat Score"];
    const exposureScore = row["Exposure Score"];
    const adjustedVulnerability = calculateAdjustedVulnerability(row, resilienceScore);
    return hazardScore * exposureScore * adjustedVulnerability;
  };

  const defineRiskLevel = (score) => {
    if (score >= 0.75) return "Very High";
    if (score >= 0.5) return "High";
    if (score >= 0.25) return "Medium";
    return "Low";
  };

  // Title Section
  doc.setFontSize(24);
  doc.text('Climate Change Risk Assessment Report', margin, currentY);
  currentY += 15;

  // City and Date
  doc.setFontSize(16);
  doc.text(`City: ${cityName}`, margin, currentY);
  currentY += 10;
  doc.setFontSize(12);
  doc.text(`Report generated on: ${new Date().toLocaleDateString()}`, margin, currentY);
  currentY += 15;

  // Executive Summary
  doc.setFontSize(14);
  doc.text('Executive Summary', margin, currentY);
  currentY += 10;
  doc.setFontSize(10);
  const summaryText = `This report presents a comprehensive Climate Change Risk Assessment for ${cityName}. ` +
    `The assessment evaluates various climate hazards and their potential impacts across different sectors.`;
  doc.text(doc.splitTextToSize(summaryText, pageWidth - 2 * margin), margin, currentY);
  currentY += 20;

  // Qualitative Assessment Section (if available)
  if (qualitativeScore !== null) {
    checkForNewPage(40);
    doc.setFontSize(14);
    doc.text('Qualitative Assessment Results', margin, currentY);
    currentY += 10;
    doc.setFontSize(10);
    doc.text(`Resilience Score: ${(qualitativeScore * 100).toFixed(1)}%`, margin, currentY);
    currentY += 7;
    const qualitativeNote = 'Note: The risk scores in this report have been adjusted based on the qualitative assessment results.';
    doc.text(doc.splitTextToSize(qualitativeNote, pageWidth - 2 * margin), margin, currentY);
    currentY += 15;
  }

  // Top Risks Section
  checkForNewPage(80);
  doc.setFontSize(14);
  doc.text('Top Climate Risks', margin, currentY);
  currentY += 10;

  const topRisks = [...ccraData]
    .sort((a, b) => {
      const scoreA = qualitativeScore ? calculateAdjustedRiskScore(a, qualitativeScore) : a["Risk Score"];
      const scoreB = qualitativeScore ? calculateAdjustedRiskScore(b, qualitativeScore) : b["Risk Score"];
      return scoreB - scoreA;
    })
    .slice(0, 3);

  topRisks.forEach((risk, index) => {
    checkForNewPage(40);
    const riskScore = qualitativeScore ? calculateAdjustedRiskScore(risk, qualitativeScore) : risk["Risk Score"];
    const riskLevel = defineRiskLevel(riskScore);

    doc.setFontSize(12);
    doc.text(`${index + 1}. ${risk.Hazard} (${risk.Sector})`, margin, currentY);
    currentY += 7;
    doc.setFontSize(10);
    doc.text(`Risk Score: ${riskScore.toFixed(2)}`, margin + 10, currentY);
    currentY += 7;
    doc.text(`Risk Level: ${riskLevel}`, margin + 10, currentY);
    currentY += 7;
    doc.text(`Climate Threat Score: ${risk["Climate Threat Score"].toFixed(2)}`, margin + 10, currentY);
    currentY += 7;
    doc.text(`Exposure Score: ${risk["Exposure Score"].toFixed(2)}`, margin + 10, currentY);
    currentY += 7;
    doc.text(`Sensitivity Score: ${risk["Sensitivity Score"].toFixed(2)}`, margin + 10, currentY);
    currentY += 12;
  });

  // Full Assessment Table
  addNewPage();
  doc.setFontSize(14);
  doc.text('Detailed Risk Assessment', margin, currentY);
  currentY += 10;

  // Prepare comprehensive table data
  const fullTableHeaders = [
    'Sector',
    'Hazard',
    'Climate Threat',
    'Exposure',
    'Sensitivity',
    'Adaptive Capacity',
    qualitativeScore ? 'Adjusted Vulnerability' : 'Vulnerability',
    qualitativeScore ? 'Adjusted Risk Score' : 'Risk Score',
    'Risk Level',
    'Custom Risk Level'
  ];

  const fullTableData = ccraData.map((row, index) => {
    const adjustedRiskScore = qualitativeScore ? calculateAdjustedRiskScore(row, qualitativeScore) : row["Risk Score"];
    const adjustedVulnerability = qualitativeScore ? calculateAdjustedVulnerability(row, qualitativeScore) : row["Vulnerability Score"];

    return [
      row.Sector,
      row.Hazard,
      row["Climate Threat Score"]?.toFixed(2),
      row["Exposure Score"]?.toFixed(2),
      row["Sensitivity Score"]?.toFixed(2),
      qualitativeScore ? qualitativeScore.toFixed(2) : row["Adaptive Capacity Score"]?.toFixed(2),
      adjustedVulnerability?.toFixed(2),
      adjustedRiskScore?.toFixed(2),
      defineRiskLevel(adjustedRiskScore),
      customRiskLevels[index] || defineRiskLevel(adjustedRiskScore)
    ];
  });

  // Add the full table
  doc.autoTable({
    startY: currentY,
    head: [fullTableHeaders],
    body: fullTableData,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [35, 81, 220] },
    margin: { top: 10 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 25 },
    }
  });

  // Add page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  return doc;
};

export const exportCCRAToPDF = (cityName, ccraData, qualitativeScore, customRiskLevels) => {
  const doc = generatePdfReport(cityName, ccraData, qualitativeScore, customRiskLevels);
  doc.save(`${cityName.replace(/\s+/g, '_')}_CCRA_Report.pdf`);
};

const isAdaptation = (type) => type === 'adaptation';

export const exportToPDF = (cityName, mitigationData, adaptationData, generatedPlans) => {
  const doc = new jsPDF();
  let yPos = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.width;
  const defaultFont = { normal: 'helvetica', bold: 'helvetica' }; // Added default font definition

  // Title
  doc.setFontSize(20);
  doc.text(`Climate Actions Report - ${cityName}`, margin, yPos);
  yPos += 20;

  // Top Mitigation Actions
  doc.setFontSize(16);
  doc.text("Top Mitigation Actions", margin, yPos);
  yPos += 15;

  mitigationData.slice(0, 3).forEach((item, index, type = 'mitigation') => {
    doc.setFont(defaultFont.normal, 'bold'); // Changed to default font
    doc.setFontSize(14);
    doc.text(`${index + 1}. ${item.action.ActionName}`, margin, yPos);
    yPos += 12;

    doc.setFont(defaultFont.normal, 'normal'); // Changed to default font
    doc.setFontSize(11);
    // Description with proper text wrapping
    const descriptionText = doc.splitTextToSize(item.action.Description, pageWidth - 2 * margin - 10);
    doc.text(descriptionText, margin + 5, yPos);
    yPos += (descriptionText.length * 7) + 8;
    // Reduction/Adaptation Potential
    const potential = item.action.GHGReductionPotential ? 
      `${getReductionPotential(item.action)}%` : 
      toTitleCase(item.action.AdaptationEffectiveness || 'N/A');
    doc.text(`${isAdaptation(type) ? 'Adaptation' : 'Reduction'} Potential: ${potential}`, margin + 5, yPos);
    yPos += 10;
    // Sector/Hazard
    const sectorOrHazard = item.action.Sector?.join ? 
      item.action.Sector.map(s => toTitleCase(s.replace('_', ' '))).join(', ') :
      item.action.Hazard?.join ?
        item.action.Hazard.map(h => toTitleCase(h)).join(', ') :
        toTitleCase(String(item.action.Sector || item.action.Hazard || ''));
    doc.text(`${isAdaptation(type) ? 'Hazard' : 'Sector'}: ${sectorOrHazard}`, margin + 5, yPos);
    yPos += 10;
    // Cost
    doc.text(`Estimated cost: ${toTitleCase(item.action.CostInvestmentNeeded || 'N/A')}`, margin + 5, yPos);
    yPos += 10;
    // Implementation time
    doc.text(`Implementation time: ${item.action.TimelineForImplementation || 'N/A'}`, margin + 5, yPos);
    yPos += 20;
  });

  // Full Mitigation List
  yPos += 10;
  doc.setFontSize(16);
  doc.text("All Mitigation Actions", margin, yPos);
  yPos += 10;

  const mitigationHeaders = [['Priority', 'Action Name', 'Reduction Potential']];
  const mitigationRows = mitigationData.map((item, index) => [
    index + 1,
    item.action.ActionName,
    item.action.GHGReductionPotential || 'N/A'
  ]);

  doc.autoTable({
    startY: yPos,
    head: mitigationHeaders,
    body: mitigationRows,
    margin: { left: margin }
  });

  // Add new page for adaptation actions
  doc.addPage();
  yPos = 20;

  // Top Adaptation Actions
  doc.setFontSize(16);
  doc.text("Top Adaptation Actions", margin, yPos);
  yPos += 15;

  adaptationData.slice(0, 3).forEach((item, index, type = 'adaptation') => {
    doc.setFont(defaultFont.normal, 'bold'); // Changed to default font
    doc.setFontSize(14);
    doc.text(`${index + 1}. ${item.action.ActionName}`, margin, yPos);
    yPos += 12;

    doc.setFont(defaultFont.normal, 'normal'); // Changed to default font
    doc.setFontSize(11);
    // Description with proper text wrapping
    const descriptionText = doc.splitTextToSize(item.action.Description, pageWidth - 2 * margin - 10);
    doc.text(descriptionText, margin + 5, yPos);
    yPos += (descriptionText.length * 7) + 8;
    // Reduction/Adaptation Potential
    const potential = item.action.GHGReductionPotential ?
      `${getReductionPotential(item.action)}%` :
      toTitleCase(item.action.AdaptationEffectiveness || 'N/A');
    doc.text(`${isAdaptation(type) ? 'Adaptation' : 'Reduction'} Potential: ${potential}`, margin + 5, yPos);
    yPos += 10;
    // Sector/Hazard
    const sectorOrHazard = item.action.Sector?.join ?
      item.action.Sector.map(s => toTitleCase(s.replace('_', ' '))).join(', ') :
      item.action.Hazard?.join ?
        item.action.Hazard.map(h => toTitleCase(h)).join(', ') :
        toTitleCase(String(item.action.Sector || item.action.Hazard || ''));
    doc.text(`${isAdaptation(type) ? 'Hazard' : 'Sector'}: ${sectorOrHazard}`, margin + 5, yPos);
    yPos += 10;
    // Cost
    doc.text(`Estimated cost: ${toTitleCase(item.action.CostInvestmentNeeded || 'N/A')}`, margin + 5, yPos);
    yPos += 10;
    // Implementation time
    doc.text(`Implementation time: ${item.action.TimelineForImplementation || 'N/A'}`, margin + 5, yPos);
    yPos += 20;
  });

  // Full Adaptation List
  yPos += 10;
  doc.setFontSize(16);
  doc.text("All Adaptation Actions", margin, yPos);
  yPos += 10;

  const adaptationHeaders = [['Priority', 'Action Name', 'Adaptation Potential']];
  const adaptationRows = adaptationData.map((item, index) => [
    index + 1,
    item.action.ActionName,
    item.action.AdaptationEffectiveness || 'N/A'
  ]);

  doc.autoTable({
    startY: yPos,
    head: adaptationHeaders,
    body: adaptationRows,
    margin: { left: margin }
  });

  // Add generated plans
  const pageHeight = doc.internal.pageSize.height;
  const contentHeight = pageHeight - 40; // Available content height per page
  const styles = {
    h2: { style: 'bold', fontSize: 14, spacing: 10 },
    normal: { style: 'normal', fontSize: 12, spacing: 7 },
    small: { style: 'italic', fontSize: 10, spacing: 5 }
  };

  const calculateTextHeight = (text, fontSize, pageWidth) => {
    const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
    return lines.length * (fontSize * 0.3528); // Convert pt to mm
  };

  if (generatedPlans && Array.isArray(generatedPlans) && generatedPlans.length > 0) {
    doc.addPage();
    yPos = 20;
    doc.setFontSize(16);
    doc.text("Generated Action Plans", margin, yPos);
    yPos += 20;

    generatedPlans.forEach((planData, index) => {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
      }

      // Calculate required height for current plan
      const plainText = convertMarkdownToPlainText(planData.plan);
      const textHeight = calculateTextHeight(plainText, styles.normal.fontSize, pageWidth);
      const headerHeight = styles.h2.spacing + styles.small.spacing + 8;
      const totalRequiredHeight = textHeight + headerHeight;

      // Check if we need a new page
      if (yPos + totalRequiredHeight > contentHeight) {
        doc.addPage();
        yPos = 20;
      }

      // Plan header with background
      doc.setFillColor(230, 240, 255);
      doc.rect(margin - 2, yPos - 6, pageWidth - 2 * margin + 4, 12, 'F');
      doc.setFont(undefined, styles.h2.style);
      doc.setFontSize(styles.h2.fontSize);
      doc.text(`Plan ${index + 1}: ${planData.actionName}`, margin, yPos);
      yPos += styles.h2.spacing;
      
      // Timestamp
      doc.setFont(undefined, 'italic');
      doc.setFontSize(styles.small.fontSize);
      doc.setTextColor(100, 100, 100);
      doc.text(new Date(planData.timestamp).toLocaleString(), margin, yPos);
      yPos += styles.small.spacing + 4;
      
      // Process the plan text with markdown support
      doc.setFont(undefined, 'normal');
      doc.setFontSize(styles.normal.fontSize);
      doc.setTextColor(0, 0, 0);
      const splitText = doc.splitTextToSize(plainText, pageWidth - 2 * margin);

      splitText.forEach(line => {
        if (yPos > contentHeight) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, margin, yPos);
        yPos += styles.normal.spacing;
      });

      // Add some spacing between plans
      yPos += 20;
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }
    });
  }

  doc.save(`${cityName}_climate_actions.pdf`);
};

export const exportUtils = {
  exportToCSV,
  exportToPDF
};

export default exportUtils;

// Placeholder for markdown conversion function.  Replace with your actual implementation.
const convertMarkdownToPlainText = (markdown) => markdown.replace(/`/g, '');