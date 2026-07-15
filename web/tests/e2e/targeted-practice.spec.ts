import { expect, test } from '@playwright/test'
import {
  collectRuntimeIssues,
  completeCurrentAction,
  continueAfterSuccess,
  currentRound,
  currentState,
} from './helpers'

test('submits a linked targeted-practice attempt with new evidence and a repair opportunity', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns the targeted-practice workflow.')
  const issues = collectRuntimeIssues(page)
  const submissions: Array<Record<string, any>> = []
  await page.route('**/api/attempt', async (route) => {
    const attempt = (await route.request().postDataJSON()).attempt as Record<string, any>
    submissions.push(attempt)
    await route.fulfill({
      body: JSON.stringify({ attemptId: attempt.attemptId, ok: true }),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/')
  await page.getByLabel('First name').fill('Practice Student')
  await page.getByLabel('Class period').selectOption('3')
  await page.locator('summary').filter({ hasText: 'Teacher controls' }).click()
  await page.getByLabel('Replay').selectOption('targeted')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('button', { name: 'Start Protein 1' }).click()

  const firstRound = await currentRound(page)
  expect(firstRound.type).toBe('transcription')
  if (firstRound.type !== 'transcription') return
  const wrongBase = firstRound.options.find((base) => base !== firstRound.answer[0])!
  const dock = page.getByTestId('task-dock')
  for (const base of `${wrongBase}${firstRound.answer.slice(1)}`) {
    await dock.getByRole('button', { exact: true, name: base }).click()
  }
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  const repairFeedback = dock.getByRole('alert')
  await expect(repairFeedback.getByText('Inspect the highlighted mismatch.', { exact: true })).toBeVisible()
  await expect(repairFeedback.getByText(
    `Pair a complementary RNA nucleotide with the DNA strand and use U, not T, at position 1: ${firstRound.template[0]} pairs with ${firstRound.answer[0]}.`,
    { exact: true },
  )).toBeVisible()
  await dock.getByRole('button', { exact: true, name: firstRound.answer[0] }).click()
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  await continueAfterSuccess(page)

  for (let action = 1; action < 9; action += 1) {
    await completeCurrentAction(page)
    await continueAfterSuccess(page)
  }

  await expect(page.getByTestId('end-screen')).toBeVisible()
  await expect.poll(() => submissions.length).toBe(1)
  const originalAttemptId = submissions[0].attemptId
  expect(submissions[0]).toMatchObject({ attemptKind: 'full-run', parentAttemptId: null })

  await page.getByRole('button', { name: 'Replay' }).click()
  await expect(page.getByTestId('transfer-screen')).toBeVisible()
  const practice = await currentState(page)
  const task = practice.transferTasks[0]
  expect(task).toBeTruthy()
  await expect(page.getByText('DNA strand:', { exact: false })).toBeVisible()
  await expect(page.getByText(task.stimulus.kind === 'transcription' ? task.stimulus.dnaTemplate.match(/.{1,3}/g)!.join(' ') : '')).toBeVisible()

  const wrongAnswer = task.options.find((option) => option !== task.expected)!
  await page.getByRole('button', { exact: true, name: wrongAnswer.replaceAll('-', ' - ') }).click()
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByRole('alert')).toContainText('Repair this answer')
  await page.getByRole('button', { exact: true, name: task.expected.replaceAll('-', ' - ') }).click()
  await page.getByRole('button', { name: 'Check answer' }).click()

  await expect(page.getByTestId('targeted-practice-end-screen')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recovered' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Original 9-stage factory run was not repeated' })).toBeVisible()
  await expect.poll(() => submissions.length).toBe(2)
  expect(submissions[1].attemptId).not.toBe(originalAttemptId)
  expect(submissions[1]).toMatchObject({
    attemptKind: 'targeted-practice',
    parentAttemptId: originalAttemptId,
  })
  expect(submissions[1].stageResults).toHaveLength(9)
  expect(submissions[1].transferResults).toHaveLength(1)
  issues.assertClean()
})
