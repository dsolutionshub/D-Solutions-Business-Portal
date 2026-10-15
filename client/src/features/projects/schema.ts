/**
 * Validation of the project form. The project and the sheet are converted to the API shape and
 * checked with the SAME shared schemas the server uses, so error paths ("sheet.links.prod") match
 * the form fields. Other keys and costs check rows the way the prototype did.
 */
import { isIsoDate, projectCreateSchema, projectSheetCreateSchema } from '@dsol/shared';
import { z } from 'zod';
import { projectToApi, sheetToApi, type ProjectFormValues } from './formMapping';

const secretInput = z.object({
  stored: z.boolean(),
  mode: z.enum(['keep', 'replace', 'clear']),
  value: z.string().max(4000, 'Secrets are limited to 4,000 characters.')
});

const extraKeyRow = z
  .object({
    id: z.string().optional(),
    label: z.string(),
    isSecret: z.boolean(),
    value: z.string().max(4000, 'Values are limited to 4,000 characters.'),
    storedSecret: z.boolean(),
    replace: z.boolean()
  })
  .superRefine((r, ctx) => {
    if (!r.label.trim() && !r.value && !r.storedSecret) return; // blank row, dropped on save
    if (!r.label.trim()) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Name this key.' });
    if (r.isSecret && (!r.storedSecret || r.replace) && !r.value)
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a value.' });
    if (!r.isSecret && r.storedSecret && !r.value)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Type the value again to store it as a plain key.'
      });
  });

const costRow = z
  .object({
    id: z.string().optional(),
    name: z.string().max(120),
    amount: z.string(),
    cycle: z.enum(['Monthly', 'Yearly']),
    nextDue: z.string()
  })
  .superRefine((r, ctx) => {
    if (!r.name.trim() && !r.amount.trim() && !r.nextDue) return; // blank row, dropped on save
    if (!r.name.trim()) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name this cost.' });
    if (r.amount.trim() && !(Number(r.amount) >= 0))
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount in ₹.' });
    if (r.nextDue && !isIsoDate(r.nextDue))
      ctx.addIssue({ code: 'custom', path: ['nextDue'], message: 'Enter a valid date (YYYY-MM-DD).' });
  });

export const projectFormSchema = z.object({
  project: z.preprocess(v => projectToApi(v as ProjectFormValues['project']), projectCreateSchema),
  sheet: z.preprocess(v => sheetToApi(v as ProjectFormValues['sheet']), projectSheetCreateSchema),
  secrets: z.record(z.string(), z.record(z.string(), secretInput)),
  extraKeys: z.array(extraKeyRow).max(50),
  costs: z.array(costRow).max(50)
});
