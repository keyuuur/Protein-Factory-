import { expect, test } from '@playwright/test'
import {
  beginRun,
  captureViewportPng,
  collectRuntimeIssues,
  continueAfterSuccess,
  currentRound,
} from './helpers'

test('shows visual repair guidance for all three action types', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns diagnostic repair coverage.')
  const issues = collectRuntimeIssues(page)
  await page.goto('/')
  await beginRun(page, { name: 'Repair Student' })
  const dock = page.getByTestId('task-dock')

  const transcription = await currentRound(page)
  expect(transcription.type).toBe('transcription')
  if (transcription.type !== 'transcription') return
  const wrongBase = transcription.options.find((base) => base !== transcription.answer[0])!
  for (const base of `${wrongBase}${transcription.answer.slice(1)}`) {
    await dock.getByRole('button', { exact: true, name: base }).click()
  }
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  const transcriptionRepair = dock.getByRole('alert')
  await expect(transcriptionRepair.getByText('Inspect the highlighted mismatch.', { exact: true })).toBeVisible()
  await expect(transcriptionRepair.getByText(
    `Pair a complementary RNA nucleotide with the DNA strand and use U, not T, at position 1: ${transcription.template[0]} pairs with ${transcription.answer[0]}.`,
    { exact: true },
  )).toBeVisible()
  await captureViewportPng(page, testInfo, 'wrong-transcription-repair')
  await dock.getByRole('button', { exact: true, name: transcription.answer[0] }).click()
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  await continueAfterSuccess(page)

  const translation = await currentRound(page)
  expect(translation.type).toBe('translation')
  if (translation.type !== 'translation') return
  const wrongSignal = translation.codonChoices[0].find((signal) => signal !== translation.answers[0])!
  await dock.getByRole('group', { name: `Signals for ${translation.codons[0]}` })
    .getByRole('button', { exact: true, name: wrongSignal }).click()
  await dock.getByRole('button', { name: 'Check codon' }).click()
  const translationRepair = dock.getByRole('alert')
  await expect(translationRepair.getByText('Inspect the highlighted mismatch.', { exact: true })).toBeVisible()
  await expect(translationRepair.getByText(
    `Read one complete mRNA codon at codon 1: ${translation.codons[0]} codes for ${translation.answers[0]}.`,
    { exact: true },
  )).toBeVisible()
  await captureViewportPng(page, testInfo, 'wrong-translation-repair')
  for (let index = 0; index < translation.answers.length; index += 1) {
    const answer = translation.answers[index]
    await dock.getByRole('group', { name: `Signals for ${translation.codons[index]}` })
      .getByRole('button', { exact: true, name: answer }).click()
    await dock.getByRole('button', { name: 'Check codon' }).click()
  }
  await continueAfterSuccess(page)

  const functionRound = await currentRound(page)
  expect(functionRound.type).toBe('protein')
  if (functionRound.type !== 'protein') return
  const wrongRow = functionRound.referenceRows.find((row) => row.id !== functionRound.correctRowId)!
  await dock.getByRole('radio').filter({ hasText: wrongRow.aminoAcidSequence.join(' - ') }).click()
  await dock.getByRole('button', { name: 'Check Match' }).click()
  const functionRepair = dock.getByRole('alert')
  await expect(functionRepair.getByText('Inspect the highlighted mismatch.', { exact: true })).toBeVisible()
  await expect(functionRepair.getByText(
    'Match all four amino acids, then use the function and trait from that same row.',
    { exact: true },
  )).toBeVisible()
  await captureViewportPng(page, testInfo, 'wrong-function-repair')
  issues.assertClean()
})
