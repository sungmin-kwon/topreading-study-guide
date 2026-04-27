type MultipleChoiceLike = {
  choices: string[];
  correctChoiceIndex: number;
};

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function buildBalancedPositions(questionCount: number, choiceCount: number) {
  const positions = Array.from({ length: questionCount }, (_item, index) => index % choiceCount);
  return shuffleInPlace(positions);
}

export function balanceCorrectChoicePositions<T extends MultipleChoiceLike>(questions: T[]) {
  if (!questions.length) {
    return questions;
  }

  const choiceCount = Math.min(...questions.map((question) => question.choices.length));
  if (choiceCount < 2) {
    return questions;
  }

  const targetPositions = buildBalancedPositions(questions.length, choiceCount);
  return questions.map((question, index) => {
    const targetIndex = targetPositions[index];
    const currentIndex = question.correctChoiceIndex;
    const choices = [...question.choices];

    if (currentIndex >= 0 && currentIndex < choices.length && targetIndex < choices.length && currentIndex !== targetIndex) {
      [choices[currentIndex], choices[targetIndex]] = [choices[targetIndex], choices[currentIndex]];
    }

    return {
      ...question,
      choices,
      correctChoiceIndex: targetIndex
    };
  });
}
