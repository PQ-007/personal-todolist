import { addDays, mondayOf } from '../../domain/dates';
import type { Task } from '../../domain/types';

/** The sample week from the prototype, placed in the current week. */
export function seedWeek(now = new Date()): Task[] {
  const mon = mondayOf(now);
  let n = 0;
  const at = (dd: number, h: number, m: number) =>
    new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + dd, h, m);
  const mk = (
    dd: number,
    h1: number,
    m1: number,
    h2: number,
    m2: number,
    title: string,
    colorId: string,
    description = '',
  ): Task => ({
    id: 'd' + ++n,
    title,
    colorId,
    description,
    done: false,
    allDay: false,
    start: at(dd, h1, m1),
    end: at(dd, h2, m2),
  });
  return [
    mk(0, 8, 0, 9, 0, 'Data entry batch', '9', '## Batch 1\n\n- [x] Export the sheet\n- [x] Clean duplicate rows\n- [ ] Upload to the shared folder\n- [ ] Message the team lead\n\n> Deadline is **09:00**, so send before the stand-up.'),
    mk(0, 11, 30, 12, 30, 'Lunch', '3'),
    mk(0, 13, 0, 15, 0, 'RPA practice', '3', '## Practice flow\n\n1. Record the click path\n2. Replace fixed waits with *wait until visible*\n3. Save the flow as `daily_update`\n\n- [x] Read the docs\n- [ ] Build the loop\n- [ ] Add error handling\n\nNotes: https://example.com/rpa-notes'),
    mk(1, 7, 0, 8, 0, 'Morning report check', '9', '- [ ] Open yesterday’s report\n- [ ] Compare spend vs plan\n- [ ] Flag anything over 10%'),
    mk(1, 9, 30, 11, 0, 'Ad report update', '9', '## Ad report update\n\n- [ ] Google Ads sheet\n- [ ] Yahoo Ads sheet\n- [ ] Check totals\n\nSee [reporting guide](https://example.com/guide).'),
    mk(1, 10, 0, 10, 45, 'Reply to emails', '6', '- [x] Client A\n- [ ] Client B\n- [ ] Vendor invoice'),
    mk(1, 11, 30, 12, 30, 'Lunch', '3'),
    mk(2, 7, 0, 8, 0, 'Morning report check', '9', '- [ ] Open yesterday’s report\n- [ ] Compare spend vs plan'),
    mk(2, 9, 30, 12, 0, 'RPA practice', '3', '## Today\n\n- [ ] Finish the loop\n- [ ] Test on 3 sample files\n- [ ] Write a short how-to in **markdown**'),
    mk(2, 12, 0, 13, 0, 'Lunch', '3'),
    mk(3, 8, 0, 9, 30, 'Weekly review prep', '10', '- [ ] Collect numbers\n- [ ] Draft slides\n- [ ] Ask for feedback'),
    mk(4, 15, 0, 16, 0, 'Plan next week', '11', '## Next week\n\n- [ ] Pick 3 priorities\n- [ ] Block focus time\n- [ ] Review calendar'),
    {
      id: 'd' + ++n,
      title: 'Month-end close',
      colorId: '11',
      allDay: true,
      done: false,
      description: 'Reminder: all reports due by end of day.',
      start: addDays(mon, 4),
      end: addDays(mon, 5),
    },
  ];
}
