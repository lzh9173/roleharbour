export const referenceMessages = {
  'reference.validation.amount': ['请输入有效的非负金额', 'Enter a valid non-negative amount'],
  'reference.validation.salaryRange': [
    '薪资下限不能高于上限',
    'The minimum salary cannot exceed the maximum',
  ],
  'reference.validation.title': ['请输入职位名称', 'Enter a job title'],
  'reference.validation.body': [
    'JD 正文至少需要 40 个字符',
    'The job description must contain at least 40 characters',
  ],
  'reference.validation.url': [
    '只接受不含账号密码的 HTTPS 链接',
    'Use an HTTPS link without a username or password',
  ],
  'reference.validation.estimateQuote': [
    '预估依据必须引用精确原文',
    'The estimate must cite an exact source excerpt',
  ],
  'reference.validation.estimateRange': [
    '预估年限必须符合所选区间',
    'Estimated experience must fit the selected range',
  ],
  'reference.validation.requirementQuote': [
    '要求必须引用精确原文',
    'Requirements must cite exact source excerpts',
  ],
  'reference.validation.experienceRange': ['经验年限区间无效', 'The experience range is invalid'],
  'reference.validation.explicitExperience': [
    '原文已有明确年限时不得保存预估',
    'Do not save an estimate when the source states explicit years',
  ],
} as const;
