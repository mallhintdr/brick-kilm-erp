import { fmtDateTime } from '../api.js';

// Table cell content: date on top, time underneath in smaller, lighter text.
export default function DateTime({ value }) {
  const [date, time] = fmtDateTime(value).split(' ');
  return (
    <span className="dt-cell">
      <span className="dt-date">{date}</span>
      {time && <span className="dt-time">{time}</span>}
    </span>
  );
}
