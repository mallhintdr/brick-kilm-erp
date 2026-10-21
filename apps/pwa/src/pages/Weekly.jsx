import { useState } from 'react';
import { useT } from '../i18n.js';
import WorkWeekGrid from '../components/WorkWeekGrid.jsx';
import { Card, CardBody, Tabs } from '../components/ui.jsx';

// One weekly grid for all piece work: moulding, bharai and nikasi (workers x Saturday-Friday).
export default function Weekly() {
  const t = useT();
  const [kind, setKind] = useState('pathera');
  return (
    <div className="grid gap-4">
      <Card><CardBody><Tabs options={[['pathera', t.moulding], ['bharai', t.loadingBharai], ['nikasi', t.unloadingNikasi]]} value={kind} onChange={setKind} /></CardBody></Card>
      <WorkWeekGrid key={kind} kind={kind} open />
    </div>
  );
}
