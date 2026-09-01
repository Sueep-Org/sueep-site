import EstimatorApp from "./EstimatorApp";

// Kept as a thin wrapper rather than the component itself: Next.js validates
// that a route's page.tsx default export only accepts params/searchParams
// props, so EstimatorApp (which also gets rendered directly, with a custom
// hideFloatingLibraryToggle prop, from src/app/estimator/page.tsx) has to
// live in its own non-page file. See EstimatorApp.tsx for the actual UI.
export default function Page() {
  return <EstimatorApp />;
}
