import type { JobDraft } from '../../src/core/schema';

export const emptyDraft: JobDraft = {
  title: '',
  employer: '',
  location: '',
  body: '',
  sourceUrl: '',
};

// Synthetic advert; Test Platform Team is a fictional employer.
export const sampleJob: JobDraft = {
  title: 'Senior DevOps Engineer',
  employer: 'Test Platform Team',
  location: 'Auckland',
  sourceUrl: '',
  body: `This is a synthetic job advertisement created for testing RoleHarbour.

We are looking for a Senior DevOps Engineer to join our platform team in Auckland. This is a permanent, full-time role, 40 hours per week.

You will design and maintain Linux infrastructure, automate deployment pipelines, and operate Kubernetes clusters. Build infrastructure as code with Terraform, improve monitoring and incident response, and work closely with software engineers to improve reliability.

You should have experience with cloud infrastructure, networking, CI/CD and scripting. The role includes maintaining system availability, troubleshooting production incidents and managing access controls.

Applicants must have existing New Zealand work rights. Visa sponsorship may be considered for exceptional candidates. No claim is made about employer accreditation.`,
};
