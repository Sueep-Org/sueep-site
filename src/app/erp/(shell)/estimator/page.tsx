export default function EstimatorPage() {
  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">AI Estimator</h1>
      <iframe
        src="/estimator/index.html"
        className="flex-1 w-full rounded-lg border border-zinc-800"
        style={{ minHeight: "80vh" }}
      />
    </div>
  );
}
