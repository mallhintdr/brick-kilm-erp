import { fmtDateTime } from '../api.js';

// Table cell content: date on top, time underneath in smaller, lighter text.
export default function DateTime({ value }) {
  const [date, time] = fmtDateTime(value).split(' ');
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className="font-semibold">{date}</span>
      {time && <span className="text-xs text-n-500">{time}</span>}
    </span>
  );
}
