/** A valid one-page PDF (200 × 300 pt, one filled rectangle) for first-page preview tests. */
export function onePagePdf() {
  const drawing = "0.2 0.4 0.7 rg 20 20 160 260 re f\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}endstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}
