import {
  getForecastCalibration,
  getForecastQuestion,
  getForecastQuestionHistory,
  getForecastScorecard,
  listForecastQuestions,
  listForecasts,
} from './forecastApi';
import {
  calibration,
  forecasts,
  outageDetail,
  outageHistory,
  outageQuestion,
  questions,
  scorecard,
} from './testing/forecastFixtures';
import { SITUATION_ID } from './testing/fixtures';
import { json, standInApi } from './testing/standIn';

/** The query of an asked request, as search parameters. */
const query = (asked: string) => new URL(`http://api.test${asked.split(' ')[1]}`).searchParams;
const path = (asked: string) => new URL(`http://api.test${asked.split(' ')[1]}`).pathname;

describe('the forecast ledger reads', () => {
  it('lists the open questions linked to a situation that resolve before a time', async () => {
    const { api, asked } = standInApi({
      'GET /v1/forecasts/questions': () => json({ items: questions, nextCursor: null }),
    });
    const due = '2027-01-20T00:00:00.000Z';
    expect(
      await listForecastQuestions(api, { linked: `situation:${SITUATION_ID}`, dueBefore: due }),
    ).toHaveLength(4);
    expect(query(asked[0]!).get('linked')).toBe(`situation:${SITUATION_ID}`);
    expect(query(asked[0]!).getAll('status')).toEqual(['open']);
    expect(query(asked[0]!).get('dueBefore')).toBe(due);
    expect(query(asked[0]!).get('limit')).toBe('500');
  });

  it('reads a question, its history and its forecasts', async () => {
    const base = `/v1/forecasts/questions/${outageQuestion.id}`;
    const { api, asked } = standInApi({
      [`GET ${base}`]: () => json(outageDetail),
      [`GET ${base}/history`]: () => json(outageHistory),
      [`GET ${base}/forecasts`]: () => json({ items: forecasts, nextCursor: null }),
    });
    expect((await getForecastQuestion(api, outageQuestion.id)).resolutionCriteria).toContain(
      '10,000',
    );
    expect((await getForecastQuestionHistory(api, outageQuestion.id)).series).toHaveLength(2);
    expect(await listForecasts(api, outageQuestion.id)).toHaveLength(4);
    expect(asked.map(path)).toEqual([base, `${base}/history`, `${base}/forecasts`]);
    expect(query(asked[2]!).get('limit')).toBe('500');
  });

  it('reads the scorecard and the calibration', async () => {
    const { api, asked } = standInApi({
      'GET /v1/forecasts/scorecard': () => json(scorecard),
      'GET /v1/forecasts/calibration': () => json(calibration),
    });
    expect((await getForecastScorecard(api)).entries).toHaveLength(2);
    expect((await getForecastCalibration(api)).n).toBe(34);
    expect(asked).toEqual(['GET /v1/forecasts/scorecard', 'GET /v1/forecasts/calibration']);
  });
});
