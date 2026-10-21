import { addDays, mondayOf } from '../../domain/dates';
import type { Label } from '../../domain/labels';
import type { Task } from '../../domain/types';

interface Seed {
  /** Day offset from this week's Monday (negative = last week, 7+ = next week). */
  day: number;
  /** "HH:MM-HH:MM", or omitted for an all-day task. */
  time?: string;
  /** Length in days for all-day tasks (default 1). */
  days?: number;
  title: string;
  color: string;
  label?: Label;
  notes?: string;
  /** Keep this task open even when it is already over (an overdue task). */
  open?: boolean;
}

/**
 * A sample planner that shows off what the app does: work and personal labels (and an unlabeled
 * event), every color, checklists at different stages, rich notes, overlapping tasks, all-day and
 * multi-day events, weekend plans, and a few tasks in the weeks around this one. Tasks that are
 * already over count as done, except ones marked `open`, so "today" always looks lived-in.
 */
const SEEDS: Seed[] = [
  // ---------- every weekday: the daily routine ----------
  ...[0, 1, 2, 3, 4].flatMap((d): Seed[] => [
    {
      day: d,
      time: '07:30-08:00',
      title: 'Morning routine',
      color: '10',
      label: 'personal',
      notes: '- [ ] Stretch 10 min\n- [ ] Coffee and plan the day\n- [ ] Check the sidebar for the first task',
    },
    {
      day: d,
      time: '09:00-09:15',
      title: 'Team stand-up',
      color: '8',
      label: 'work',
      notes: 'Yesterday / today / blockers. Keep it under 15 minutes.',
    },
    { day: d, time: '12:00-13:00', title: 'Lunch', color: '6', label: 'personal' },
  ]),

  // ---------- Monday ----------
  {
    day: 0,
    time: '09:30-11:30',
    title: 'Weekly ad report',
    color: '9',
    label: 'work',
    notes:
      '## Sources\n\n- [x] Export Google Ads data\n- [x] Export Yahoo Ads data\n- [ ] Merge sheets and check totals\n- [ ] Write the summary\n\n> Send before the **14:00** sync.\n\nTemplate: [reporting guide](https://example.com/guide)',
  },
  { day: 0, time: '14:00-15:00', title: 'Client sync', color: '11', label: 'work', notes: '- [ ] Share the weekly numbers\n- [ ] Agree on next month’s budget' },
  { day: 0, time: '19:00-20:00', title: 'Gym: legs', color: '10', label: 'personal', notes: '- [ ] Squats 4×8\n- [ ] Lunges 3×10\n- [ ] Stretch' },

  // ---------- Tuesday ----------
  {
    day: 1,
    time: '10:00-12:00',
    title: 'Build RPA flow',
    color: '3',
    label: 'work',
    notes:
      '## Steps\n\n1. Record the click path\n2. Replace fixed waits with *wait until visible*\n3. Save the flow as `daily_update`\n\n- [x] Read the docs\n- [ ] Build the loop\n- [ ] Add error handling\n- [ ] Test on 3 sample files',
  },
  // Overlaps the RPA block, so the grid shows them side by side.
  { day: 1, time: '11:00-11:30', title: 'Reply to emails', color: '6', label: 'work', notes: '- [x] Client A\n- [ ] Client B\n- [ ] Vendor invoice', open: true },
  { day: 1, time: '18:30-19:30', title: 'Japanese practice', color: '3', label: 'personal', notes: '- [ ] 20 new words\n- [ ] One page of reading\n- [ ] Shadowing 10 min' },

  // ---------- Wednesday ----------
  { day: 2, title: 'Pay rent', color: '11', label: 'personal', notes: 'Transfer before the end of the day.' },
  {
    day: 2,
    time: '09:30-11:00',
    title: 'Data entry batch',
    color: '9',
    label: 'work',
    notes: '- [x] Export the sheet\n- [x] Clean duplicate rows\n- [ ] Upload to the shared folder\n- [ ] Message the team lead',
  },
  { day: 2, time: '10:00-10:30', title: '1:1 with manager', color: '8', label: 'work', notes: '- [ ] Ask about the Q4 goals\n- [ ] Mention the RPA progress' },
  { day: 2, time: '14:00-16:00', title: 'Focus: dashboard redesign', color: '3', label: 'work', notes: '## Goal\n\nOne page the team can read in 30 seconds.\n\n- [ ] Pick 3 key numbers\n- [ ] Sketch the layout\n- [ ] Get feedback' },
  { day: 2, time: '20:00-21:00', title: 'Read a book', color: '10', label: 'personal' },

  // ---------- Thursday ----------
  { day: 3, days: 2, title: 'Marketing conference', color: '6', label: 'work', notes: 'Hall B. Badge pickup from 08:30.\n\n- [ ] Bring business cards\n- [ ] Take notes for the team' },
  { day: 3, time: '08:00-09:00', title: 'Weekly review prep', color: '10', label: 'work', notes: '- [ ] Collect numbers\n- [ ] Draft slides\n- [ ] Ask for feedback' },
  { day: 3, time: '15:30-16:00', title: 'Dentist', color: '11', label: 'personal' },
  // Unlabeled: an event that came from Google Calendar as-is. It only shows under "All".
  { day: 3, time: '17:00-18:00', title: 'Building maintenance', color: '8' },

  // ---------- Friday ----------
  { day: 4, title: 'Month-end close', color: '11', label: 'work', notes: 'All reports due by end of day.' },
  { day: 4, time: '10:00-11:00', title: 'Sprint demo', color: '9', label: 'work', notes: '- [ ] Prepare the demo data\n- [ ] Rehearse once' },
  { day: 4, time: '15:00-16:00', title: 'Plan next week', color: '11', label: 'work', notes: '## Next week\n\n- [ ] Pick 3 priorities\n- [ ] Block focus time\n- [ ] Review the calendar' },
  { day: 4, time: '19:00-21:30', title: 'Dinner with friends', color: '6', label: 'personal', notes: 'Booked for 4 people.' },

  // ---------- weekend ----------
  { day: 5, time: '09:00-10:00', title: 'Long run', color: '10', label: 'personal', notes: '- [ ] 10 km easy pace\n- [ ] Stretch after' },
  { day: 5, time: '11:00-12:00', title: 'Groceries', color: '6', label: 'personal', notes: '- [ ] Rice\n- [ ] Eggs\n- [ ] Vegetables\n- [ ] Coffee beans' },
  { day: 5, time: '14:00-17:00', title: 'Side project', color: '3', label: 'personal', notes: '## Planner app\n\n- [x] Day view\n- [x] Labels\n- [ ] Recurring tasks\n- [ ] Reminders' },
  { day: 6, time: '10:00-12:00', title: 'Family brunch', color: '6', label: 'personal' },
  { day: 6, time: '16:00-17:00', title: 'Weekly reset', color: '8', label: 'personal', notes: '- [ ] Clean the desk\n- [ ] Laundry\n- [ ] Plan the week ahead' },

  // ---------- around this week ----------
  { day: -3, time: '10:00-11:00', title: 'Quarterly planning', color: '9', label: 'work' },
  { day: 7, time: '09:30-11:00', title: 'Kickoff: new campaign', color: '9', label: 'work', notes: '- [ ] Share the brief\n- [ ] Assign owners' },
  { day: 8, days: 3, title: 'Trip to Osaka', color: '6', label: 'personal', notes: '- [ ] Book the hotel\n- [ ] Pack\n- [ ] Shinkansen tickets' },
];

/** The sample planner, placed around the week of `now`. */
export function seedWeek(now = new Date()): Task[] {
  const mon = mondayOf(now);
  return SEEDS.map((s, i) => {
    const day = addDays(mon, s.day);
    let start = day;
    let end = addDays(day, s.days ?? 1);
    if (s.time) {
      const [h1, m1, h2, m2] = s.time.split(/[-:]/).map(Number) as [number, number, number, number];
      start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h1, m1);
      end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h2, m2);
    }
    return {
      id: 'd' + (i + 1),
      title: s.title,
      description: s.notes ?? '',
      colorId: s.color,
      ...(s.label ? { label: s.label } : {}),
      allDay: !s.time,
      start,
      end,
      done: end <= now && !s.open,
    };
  });
}
