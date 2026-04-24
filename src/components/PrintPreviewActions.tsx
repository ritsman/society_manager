"use client";

export default function PrintPreviewActions() {
  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 print:hidden">
      <div>
        <p className="text-sm font-semibold text-gray-900">Ledger Preview</p>
        <p className="text-xs text-gray-600">
          Use Download PDF to save a PDF, or Print for a paper copy.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          Print
        </button>
      </div>
    </div>
  );
}
