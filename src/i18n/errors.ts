export const errorMessages = {
  'errors.localReading': [
    '无法整理这个职位，请刷新页面后重试。',
    'Could not read this job. Refresh the page and try again.',
  ],
  'errors.requestInvalid': ['请求格式无效。', 'Invalid request format.'],
  'errors.pageUnsupported': [
    '此页面不支持插件操作。',
    'This page does not support extension actions.',
  ],
  'errors.requestFailed': [
    '插件暂时无法完成此操作，请刷新页面后重试。',
    'The extension could not complete this request. Refresh the page and try again.',
  ],
  'errors.settingsOpen': ['无法打开插件设置。', 'Unable to open extension settings.'],
  'errors.csvQuoteFormat': ['CSV 引号格式不正确', 'Invalid CSV quoting'],
  'errors.csvAfterQuote': [
    'CSV 引号后出现无效字符',
    'Invalid characters after a closing CSV quote',
  ],
  'errors.csvUnclosedQuote': ['CSV 引号未闭合', 'Unclosed CSV quote'],
  'errors.csvHeaders': ['CSV 表头无效', 'Invalid CSV headers'],
  'errors.csvColumns': ['CSV 列数不一致', 'Inconsistent CSV column count'],
  'errors.snapshotSize': ['快照超过大小上限', 'The snapshot exceeds the size limit'],
  'errors.snapshotRows': ['快照行数无效', 'Invalid snapshot row count'],
  'errors.employerRecord': ['雇主记录无效', 'Invalid employer record'],
  'errors.employerIdentity': [
    '雇主名称或 NZBN 无效/重复',
    'Invalid or duplicate employer name or NZBN',
  ],
  'errors.employerVerificationTime': [
    '雇主核验时间无效',
    'Invalid employer verification timestamp',
  ],
  'errors.localListVersion': ['本地名单版本无效', 'Invalid local list version'],
  'errors.snapshotDomain': ['快照域名无效', 'Invalid snapshot domain'],
  'errors.snapshotCatalogue': ['快照目录无效', 'Invalid snapshot catalogue'],
  'errors.snapshotCatalogueVersion': ['快照目录版本无效', 'Invalid snapshot catalogue version'],
  'errors.snapshotCatalogueFields': ['快照目录字段无效', 'Invalid snapshot catalogue fields'],
  'errors.snapshotOlder': [
    '发布目录旧于已缓存快照，保留原数据',
    'The published catalogue is older than the cached snapshot. Existing data has been kept',
  ],
  'errors.snapshotFileSize': ['快照文件大小不一致', 'Snapshot file size mismatch'],
  'errors.snapshotChecksum': ['快照校验和不一致', 'Snapshot checksum mismatch'],
  'errors.snapshotDatesMissing': [
    '快照缺少到期日或核验时间',
    'The snapshot is missing expiry or verification dates',
  ],
  'errors.snapshotCancelled': ['快照同步已取消', 'Snapshot sync was cancelled'],
  'errors.snapshotSync': ['快照同步失败', 'Snapshot sync failed'],
  'errors.importMetadata': ['导入来源或日期无效', 'Invalid import source or date'],
  'errors.verificationAfterSnapshot': [
    '雇主核验时间晚于名单生成时间',
    'The employer verification date is later than the list creation date',
  ],
  'errors.employerBackupSize': [
    '雇主备份不能超过 12 MiB。',
    'The employer backup must not exceed 12 MiB.',
  ],
  'errors.employerBackupEmpty': [
    '本地没有雇主名单可备份。',
    'There is no local employer list to back up.',
  ],
  'errors.employerBackupFormat': [
    '雇主备份格式或版本无效',
    'Invalid employer backup format or version',
  ],
  'errors.employerBackupFields': [
    '雇主备份记录包含无效字段',
    'The employer backup contains invalid record fields',
  ],
  'errors.employerNameInput': ['雇主名称输入无效', 'Invalid employer name input'],
  'errors.employerNameLength': [
    '公司名称不足或过长，需人工核实',
    'The company name is too short or too long. Manual verification is needed',
  ],
  'errors.snapshotNotDownloaded': [
    '尚未下载雇主公开快照',
    'No public employer snapshot has been downloaded yet',
  ],
  'errors.employerMatchNote': [
    '仅按名称匹配公开快照；不代表当前认证状态、实际聘用公司或职位签证支持。',
    'This is a name match against a public snapshot. It does not confirm current accreditation, the actual hiring employer or visa support for this job.',
  ],
  'errors.employerNoMatch': [
    '本地快照未找到完全一致的名称；不代表雇主未认证。',
    'No exact name match was found in the local snapshot. This does not mean the employer is unaccredited.',
  ],
  'errors.employerMultipleMatches': [
    '同名对应多个 NZBN，需核实实际聘用公司。',
    'This name matches multiple NZBNs. Verify the actual hiring employer.',
  ],
  'errors.employerCandidates': [
    '找到 {count} 个可能对应的雇主，显示 {shown} 个；仅名称相近，需核实实际聘用公司和 NZBN。未确认匹配不代表雇主未认证。',
    'Found {count} possible employers; showing {shown}. These are name suggestions only. Verify the actual hiring employer and NZBN. An unconfirmed match does not mean the employer is unaccredited.',
  ],
  'errors.employerExpiry': [
    '快照到期日已到、已过或无法确认；需到 INZ 核实当前状态。',
    'The snapshot expiry date has been reached, has passed or is unknown. Check the current status with INZ.',
  ],
  'errors.snapshotDownload': ['快照下载失败 ({status})', 'Snapshot download failed ({status})'],
} as const;
