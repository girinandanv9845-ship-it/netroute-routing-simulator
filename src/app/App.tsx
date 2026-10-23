import { DashboardLayout } from '../components/layout/DashboardLayout';
import { useSimulationLoop } from '../hooks/useSimulationLoop';

export default function App() {
  useSimulationLoop();
  return <DashboardLayout />;
}
