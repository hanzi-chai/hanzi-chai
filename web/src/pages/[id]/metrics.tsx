import { Skeleton } from "antd";
import { Suspense } from "react";
import { ErrorBoundary } from "~/components/Error";
import MetricTable from "~/components/MetricTable";
import { useChaifenTitle } from "~/utils";

export default function Metrics() {
  useChaifenTitle("指标");
  return (
    <ErrorBoundary>
      <Suspense fallback={<Skeleton active />}>
        <MetricTable />
      </Suspense>
    </ErrorBoundary>
  );
}
