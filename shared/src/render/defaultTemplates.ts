/**
 * The templates every installation starts with (from the prototype's wording, with its
 * [placeholders] turned into {{variables}} where the app can fill them). Editable in Email Center →
 * Templates; the seed and the 0002 migration insert them.
 */
export const DEFAULT_EMAIL_TEMPLATES: { name: string; subject: string; bodyHtml: string }[] = [
  {
    name: 'Software Release Announcement',
    subject: '{{project}} {{version}} is live',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>We have released <b>{{project}} {{version}}</b> to production.</p>{{release_notes}}<p>No action is needed on your side. Reply to this email if you notice anything unexpected.</p><p>Regards,<br>{{company}}</p>'
  },
  {
    name: 'Invoice Notification',
    subject: 'Invoice {{invoice_no}} from {{company}}',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>Please find invoice <b>{{invoice_no}}</b> for <b>{{amount}}</b>, due on <b>{{due_date}}</b>. Use the button below to view or download it.</p><p>Regards,<br>{{company}} Accounts</p>'
  },
  {
    name: 'Payment Receipt',
    subject: 'Payment received — {{invoice_no}}',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>Thank you — we have received <b>{{amount}}</b> against invoice <b>{{invoice_no}}</b>. Your receipt number is <b>{{receipt_no}}</b>.</p><p>Regards,<br>{{company}} Accounts</p>'
  },
  {
    name: 'Payment Reminder',
    subject: 'Payment reminder — {{invoice_no}}',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>This is a friendly reminder that invoice <b>{{invoice_no}}</b> for <b>{{amount}}</b> was due on <b>{{due_date}}</b>. If you have already paid, please share the transaction reference.</p><p>Regards,<br>{{company}} Accounts</p>'
  },
  {
    name: 'Domain Expiry Reminder',
    subject: 'Domain renewal reminder for {{client_name}}',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>Your domain <b>{{domain}}</b> expires on <b>{{expiry}}</b>. Please confirm renewal so we can renew it without interruption.</p><p>Regards,<br>{{company}}</p>'
  },
  {
    name: 'Hosting Renewal',
    subject: 'Hosting renewal due for {{client_name}}',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>The hosting plan for <b>{{client_name}}</b> renews on <b>{{expiry}}</b> for <b>{{amount}}</b>. Let us know if you want to change the plan.</p><p>Regards,<br>{{company}}</p>'
  },
  {
    name: 'Maintenance Notice',
    subject: 'Scheduled maintenance — [date], [time window] IST',
    bodyHtml:
      '<p>Hi {{contact}},</p><p>We will carry out scheduled maintenance on <b>{{client_name}}</b> systems on <b>[date]</b> between <b>[time window] IST</b>. The storefront may be briefly unavailable.</p><p>Regards,<br>{{company}}</p>'
  },
  {
    name: 'General',
    subject: 'An update from {{company}}',
    bodyHtml: '<p>Hi {{contact}},</p><p>[Your announcement]</p><p>Regards,<br>{{company}}</p>'
  }
];
