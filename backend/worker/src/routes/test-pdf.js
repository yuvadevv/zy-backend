import { PDFDocument } from 'pdf-lib';

export async function handleTestPdf(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ success: false, error: 'No file provided' }), { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF using pdf-lib
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Get page count
    const pages = pdfDoc.getPageCount();
    
    return new Response(JSON.stringify({ success: true, pages }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message, stack: error.stack }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
