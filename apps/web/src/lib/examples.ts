export const EXAMPLE_CERTIFICATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      background: #f8fafc;
      color: #0f172a;
      padding: 48px;
    }
    .certificate {
      max-width: 720px;
      margin: 0 auto;
      border: 6px double #1e3a5f;
      background: #fff;
      padding: 48px 40px;
      text-align: center;
    }
    .eyebrow {
      letter-spacing: 0.28em;
      text-transform: uppercase;
      font-size: 12px;
      color: #64748b;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 32px;
      color: #1e3a5f;
      margin-bottom: 24px;
    }
    .label {
      font-size: 14px;
      color: #475569;
      margin: 12px 0 4px;
    }
    .value {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .footer {
      margin-top: 32px;
      font-size: 13px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <p class="eyebrow">Certificate of completion</p>
    <h1>Awarded to</h1>
    <p class="label">Student</p>
    <p class="value">{{studentName}}</p>
    <p class="label">For completing</p>
    <p class="value">{{courseName}}</p>
    <p class="footer">Issued on {{issueDate}}</p>
  </div>
</body>
</html>`;

export const EXAMPLE_TEMPLATE_VARIABLES = {
  studentName: 'Jane Doe',
  courseName: 'Full Stack Development',
  issueDate: '2026-07-21',
};

export const EXAMPLE_BATCH_ITEMS = [
  {
    variables: {
      studentName: 'Alice Johnson',
      courseName: 'Cloud Architecture',
      issueDate: '2026-07-21',
    },
  },
  {
    variables: {
      studentName: 'Bob Smith',
      courseName: 'Cloud Architecture',
      issueDate: '2026-07-21',
    },
  },
];
