import mongoose from 'mongoose';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const env = fs.readFileSync('.env', 'utf8');
const uri = env.match(/MONGODB_URI=(.*)/)[1].trim();

function splitIntoSegments(text, segmentSize = 500, overlapSize = 50) {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const segments = [];
  let segmentIndex = 0;
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + segmentSize, words.length);
    const segmentWords = words.slice(startIndex, endIndex);
    const segmentText = segmentWords.join(' ');

    segments.push({
      text: segmentText,
      segmentIndex,
      wordCount: segmentWords.length,
    });

    segmentIndex++;
    if (endIndex >= words.length) break;
    startIndex = endIndex - overlapSize;
  }
  return segments;
}

async function repairBook(slug) {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const book = await db.collection('books').findOne({ slug });
  if (!book) {
    console.log(`Book with slug "${slug}" not found.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found book: "${book.title}", fileURL: ${book.fileURL}`);
  console.log(`Downloading PDF from blob storage...`);

  const response = await fetch(book.fileURL);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log(`Downloaded ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB. Parsing PDF pages...`);

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  console.log(`Total PDF pages: ${pdfDoc.numPages}`);

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item) => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      fullText += pageText + '\n';
      if (pageNum % 50 === 0 || pageNum === pdfDoc.numPages) {
        console.log(`Parsed page ${pageNum}/${pdfDoc.numPages}`);
      }
    } catch (err) {
      console.warn(`Error on page ${pageNum}:`, err.message);
    }
  }

  console.log(`Text extraction complete. Total characters: ${fullText.length}. Splitting into segments...`);
  const segments = splitIntoSegments(fullText.trim());
  console.log(`Generated ${segments.length} segments.`);

  if (segments.length === 0) {
    console.error('No segments extracted.');
    await mongoose.disconnect();
    return;
  }

  // Clear existing segments
  await db.collection('booksegments').deleteMany({ bookId: book._id });

  // Insert in batches of 100
  const docsToInsert = segments.map((s) => ({
    clerkId: book.clerkId,
    bookId: book._id,
    content: s.text,
    segmentIndex: s.segmentIndex,
    pageNumber: Math.floor(s.segmentIndex * (pdfDoc.numPages / segments.length)) + 1,
    wordCount: s.wordCount,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < docsToInsert.length; i += BATCH_SIZE) {
    const batch = docsToInsert.slice(i, i + BATCH_SIZE);
    await db.collection('booksegments').insertMany(batch);
    console.log(`Inserted segments ${i + 1} to ${Math.min(i + BATCH_SIZE, docsToInsert.length)}`);
  }

  const estimatedMinutes = Math.max(5, Math.round((segments.length * 450) / 200));
  await db.collection('books').updateOne(
    { _id: book._id },
    {
      $set: {
        totalSegments: segments.length,
        readingTimeMinutes: estimatedMinutes,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`Successfully repaired book "${book.title}"! Total segments: ${segments.length}`);
  await mongoose.disconnect();
}

const slug = process.argv[2] || 'oceanofpdf';
repairBook(slug).catch(console.error);
