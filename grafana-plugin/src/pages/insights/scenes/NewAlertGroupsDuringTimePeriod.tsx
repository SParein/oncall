import { ThresholdsMode } from '@grafana/data';
import { SceneFlexItem, SceneQueryRunner, VizPanel } from '@grafana/scenes';

import { Datasource } from 'pages/insights/config';

export function getNewAlertGroupsDuringTimePeriodScene() {
  const query = new SceneQueryRunner({
    datasource: Datasource.GrafanaCloudPrometheus,
    queries: [
      {
        disableTextWrap: false,
        editorMode: 'code',
        excludeNullMetadata: false,
        exemplar: false,
        expr: 'increase(max_over_time(sum by (integration) (avg without(pod, instance) ($alert_groups_total{slug=~"$instance", team=~"$team", integration=~"$integration"}))[30m:])[1h:])',
        fullMetaSearch: false,
        instant: false,
        legendFormat: '__auto',
        range: true,
        refId: 'A',
        useBackend: false,
      },
    ],
  });

  return new SceneFlexItem({
    $data: query,
    body: new VizPanel({
      title: 'New alert groups during time period',
      pluginId: 'timeseries',
      fieldConfig: {
        defaults: {
          color: {
            mode: 'palette-classic',
          },
          custom: {
            axisCenteredZero: false,
            axisColorMode: 'text',
            axisLabel: '',
            axisPlacement: 'auto',
            barAlignment: 0,
            drawStyle: 'line',
            fillOpacity: 80,
            gradientMode: 'opacity',
            hideFrom: {
              legend: false,
              tooltip: false,
              viz: false,
            },
            lineInterpolation: 'linear',
            lineStyle: {
              fill: 'solid',
            },
            lineWidth: 1,
            pointSize: 5,
            scaleDistribution: {
              type: 'linear',
            },
            showPoints: 'auto',
            spanNulls: false,
            stacking: {
              group: 'A',
              mode: 'normal',
            },
            thresholdsStyle: {
              mode: 'off',
            },
          },
          decimals: 0,
          displayName: '${__field.labels.integration}',
          mappings: [],
          thresholds: {
            mode: ThresholdsMode.Absolute,
            steps: [
              {
                color: 'green',
                value: null,
              },
            ],
          },
        },
        overrides: [
          {
            matcher: {
              id: 'byValue',
              options: {
                op: 'gte',
                reducer: 'allIsZero',
                value: 0,
              },
            },
            properties: [
              {
                id: 'custom.hideFrom',
                value: {
                  legend: true,
                  tooltip: true,
                  viz: true,
                },
              },
            ],
          },
        ],
      },
      options: {
        legend: {
          displayMode: 'list',
          placement: 'bottom',
          showLegend: true,
        },
        tooltip: {
          mode: 'multi',
          sort: 'desc',
        },
      },
    }),
  });
}
