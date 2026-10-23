import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { useT } from '../i18n.js';
import { get } from '../api.js';
import { Card, CardHeader, CardBody, SkeletonCards, cx } from '../components/ui.jsx';

// Health Check: figures that look wrong (negative stock, missing opening stock, gaps), each with a link to fix it.
export default function Health() {
  const t = useT();
  const [d, setD] = useState(null);
  useEffect(() => { get('/health').then(setD).catch(() => setD({ issues: [] })); }, []);
  if (!d) return <SkeletonCards n={3} />;
  return (
    <Card>
      <CardHeader title={t.healthCheck} />
      <CardBody>
        {!d.issues.length && (
          <p className="m-0 flex items-center justify-center gap-2 rounded-lg bg-green-50 p-4 font-semibold text-gain"><CheckCircle2 className="size-5" />{t.hcAllGood}</p>
        )}
        {d.issues.map((i) => (
          <Link key={i.key + i.value} to={i.link} className={cx('flex items-center gap-3 rounded-lg p-3 no-underline ring-1', i.level === 'err' ? 'bg-red-50 ring-red-200' : 'bg-amber-50 ring-amber-200')}>
            {i.level === 'err' ? <AlertTriangle className="size-5 shrink-0 text-loss" /> : <AlertCircle className="size-5 shrink-0 text-caution" />}
            <span className="grid min-w-0 flex-1">
              <strong className="text-md text-n-900">{t[i.key]}</strong>
              {i.value && <span className="truncate text-sm text-n-600">{i.value}</span>}
            </span>
            <ChevronRight className="size-4 shrink-0 text-n-400 rtl:rotate-180" />
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
