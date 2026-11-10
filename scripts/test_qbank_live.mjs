const testPayload = {
  bookTitle: "2 The Essentials Of MRCP Volume 1 15 299",
  pageNumber: 175,
  pageText: `175 pre-eCLamPsia overvieW
• Pre-eclampsia describes the emergence of high blood pressure during pregnancy that may be a precursor to a woman developing eclampsia and other complications.
• It is classically a triad of 3 things:
  - New-onset hypertension
  - Proteinuria
  - Oedema
Pathophysiology: Defective spiral artery remodeling, systemic vasoconstriction, HELLP syndrome, maternal endothelial damage.`,
  language: "en"
};

async function testEndpoint() {
  const start = Date.now();
  console.log("Sending POST to http://localhost:3000/api/qbank...");
  try {
    const res = await fetch("http://localhost:3000/api/qbank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload)
    });
    const data = await res.json();
    console.log(`Endpoint returned in ${Date.now() - start}ms:`);
    console.log("Source used:", data.source);
    console.log("Question count:", data.questions?.length);
    if (data.questions && data.questions[0]) {
      console.log("\nSample Question 1:");
      console.log("Exam Type:", data.questions[0].examType);
      console.log("Topic:", data.questions[0].topic);
      console.log("Vignette:", data.questions[0].vignette);
      console.log("Options:", data.questions[0].options);
      console.log("Rationales:", data.questions[0].distractorRationales);
      console.log("Takeaway:", data.questions[0].highYieldTakeaway);
    }
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}
testEndpoint();
