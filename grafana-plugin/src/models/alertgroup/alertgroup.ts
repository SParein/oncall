import { action, observable, makeObservable, runInAction } from 'mobx';
import qs from 'query-string';

import { BaseStore } from 'models/base_store';
import { ActionKey } from 'models/loader/action-keys';
import { User } from 'models/user/user.types';
import { makeRequest } from 'network/network';
import { ApiSchemas } from 'network/oncall-api/api.types';
import { RootStore } from 'state/rootStore';
import { SelectOption } from 'state/types';
import { LocationHelper } from 'utils/LocationHelper';
import { AutoLoadingState, WithGlobalNotification } from 'utils/decorators';
import { openErrorNotification, refreshPageError, showApiError } from 'utils/utils';

import { AlertGroupColumn, Alert, AlertAction, IncidentStatus } from './alertgroup.types';

export class AlertGroupStore extends BaseStore {
  @observable.shallow
  bulkActions: any = [];

  @observable.shallow
  silenceOptions: any;

  @observable.shallow
  items: { [id: string]: Alert } = {};

  @observable.shallow
  searchResult: { [key: string]: Array<Alert['pk']> } = {};

  @observable
  incidentFilters: any;

  initialQuery = qs.parse(window.location.search);

  @observable
  incidentsCursor?: string;

  @observable
  alertsSearchResult: {
    [key: string]: {
      prev?: string;
      next?: string;
      results?: string[];
      page_size?: number;
    };
  } = {};

  @observable
  alerts = new Map<string, Alert>();

  @observable
  newIncidents: any = {};

  @observable
  acknowledgedIncidents: any = {};

  @observable
  resolvedIncidents: any = {};

  @observable
  silencedIncidents: any = {};

  @observable
  liveUpdatesEnabled = false;

  @observable
  liveUpdatesPaused = false;

  @observable
  latestFetchAlertGroupsTimestamp: number;

  @observable
  columns: AlertGroupColumn[] = [];

  @observable
  isDefaultColumnOrder = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this);

    this.path = '/alertgroups/';
  }

  async attachAlert(pk: Alert['pk'], rootPk: Alert['pk']) {
    return await makeRequest(`${this.path}${pk}/attach/`, {
      method: 'POST',
      data: { root_alert_group_pk: rootPk },
    }).catch(showApiError);
  }

  async unattachAlert(pk: Alert['pk']) {
    return await makeRequest(`${this.path}${pk}/unattach/`, {
      method: 'POST',
    }).catch(showApiError);
  }

  @action.bound
  async updateItem(id: Alert['pk']) {
    const item = await this.getById(id);

    runInAction(() => {
      this.items = {
        ...this.items,
        [item.pk]: item,
      };
    });
  }

  @action.bound
  async fetchItems(query = '', params = {}) {
    const { results } = await makeRequest(`${this.path}`, {
      params: { search: query, ...params },
    });

    runInAction(() => {
      this.items = {
        ...this.items,
        ...results.reduce(
          (acc: { [key: number]: Alert }, item: Alert) => ({
            ...acc,
            [item.pk]: item,
          }),
          {}
        ),
      };

      this.searchResult = {
        ...this.searchResult,
        [query]: results.map((item: Alert) => item.pk),
      };
    });
  }

  @action.bound
  async fetchItemsAvailableForAttachment(query: string) {
    await this.fetchItems(query, {
      status: [IncidentStatus.Acknowledged, IncidentStatus.Firing, IncidentStatus.Silenced],
    });
  }

  getSearchResult = (query = '') => {
    if (!this.searchResult[query]) {
      return undefined;
    }
    return this.searchResult[query].map((id: Alert['pk']) => this.items[id]);
  };

  async getAlertGroupsForIntegration(integrationId: ApiSchemas['AlertReceiveChannel']['id']) {
    const { results } = await makeRequest(`${this.path}`, {
      params: { integration: integrationId },
    });
    return results;
  }

  async getAlertsFromGroup(pk: Alert['pk']) {
    return await makeRequest(`${this.path}${pk}`, {});
  }

  async updateSilenceOptions() {
    const result = await makeRequest(`${this.path}silence_options/`, {});

    runInAction(() => {
      this.silenceOptions = result;
    });
  }

  async resolve(id: Alert['pk'], delay: number) {
    await makeRequest(`${this.path}${id}/silence/`, {
      method: 'POST',
      data: { delay },
    });
  }

  async unresolve(id: Alert['pk']) {
    await makeRequest(`${this.path}${id}/unresolve/`, {
      method: 'POST',
    });
  }

  async acknowledge(id: Alert['pk']) {
    await makeRequest(`${this.path}${id}/acknowledge/`, {
      method: 'POST',
    });
  }

  async unacknowledge(id: Alert['pk']) {
    await makeRequest(`${this.path}${id}/unacknowledge/`, {
      method: 'POST',
    });
  }

  async silence(id: Alert['pk'], delay: number) {
    await makeRequest(`${this.path}${id}/silence/`, {
      method: 'POST',
      data: { delay },
    });
  }

  async unsilence(id: Alert['pk']) {
    await makeRequest(`${this.path}${id}/unsilence/`, {
      method: 'POST',
    });
  }

  @AutoLoadingState(ActionKey.RESET_COLUMNS_FROM_ALERT_GROUP)
  @WithGlobalNotification({ success: 'Columns list has been reset' })
  async resetColumns() {
    await this.resetTableSettings();
    await this.fetchTableSettings();
  }

  @AutoLoadingState(ActionKey.REMOVE_COLUMN_FROM_ALERT_GROUP)
  @WithGlobalNotification({
    success: 'Column has been removed from the list.',
    failure: 'There was an error processing your request. Please try again',
  })
  async removeTableColumn(
    columnToBeRemoved: AlertGroupColumn,
    convertColumnsToTableSettings: (columns: AlertGroupColumn[]) => {
      visible: AlertGroupColumn[];
      hidden: AlertGroupColumn[];
    }
  ) {
    const columns = this.columns.filter(
      (col) =>
        col.id !== columnToBeRemoved.id || (col.id === columnToBeRemoved.id && col.type !== columnToBeRemoved.type)
    );

    await this.updateTableSettings(convertColumnsToTableSettings(columns), false);
    await this.fetchTableSettings();
  }

  @action.bound
  async updateBulkActions() {
    const response = await makeRequest(`${this.path}bulk_action_options/`, {});

    runInAction(() => {
      this.bulkActions = response.reduce(
        (acc: { [key: string]: boolean }, item: SelectOption) => ({
          ...acc,
          [item.value]: true,
        }),
        {}
      );
    });
  }

  async bulkAction(data: any) {
    return await makeRequest(`${this.path}bulk_action/`, {
      method: 'POST',
      data,
    });
  }

  async renderPreview(id: Alert['pk'], template_name: string, template_body: string) {
    return await makeRequest(`${this.path}${id}/preview_template/`, {
      method: 'POST',
      data: { template_name, template_body },
    });
  }

  async fetchIncidentsAndStats(isPollingJob = false) {
    await Promise.all([
      this.getNewIncidentsStats(),
      this.getAcknowledgedIncidentsStats(),
      this.getResolvedIncidentsStats(),
      this.getSilencedIncidentsStats(),
      this.fetchAlertGroups(isPollingJob),
    ]);
    this.setLiveUpdatesPaused(false);
  }

  @action.bound
  setLiveUpdatesPaused(value: boolean) {
    this.liveUpdatesPaused = value;
  }

  @action.bound
  @AutoLoadingState(ActionKey.UPDATE_FILTERS_AND_FETCH_INCIDENTS)
  async updateIncidentFiltersAndRefetchIncidentsAndStats(params: any, keepCursor = false) {
    if (!keepCursor) {
      this.setIncidentsCursor(undefined);
    }
    this.incidentFilters = params;
    await this.fetchIncidentsAndStats();
  }

  @action.bound
  async updateIncidentsCursor(cursor: string) {
    this.setIncidentsCursor(cursor);

    this.fetchAlertGroups();
  }

  @action.bound
  async setIncidentsCursor(cursor: string) {
    this.incidentsCursor = cursor;

    LocationHelper.update({ cursor }, 'partial');
  }

  @action.bound
  async setIncidentsItemsPerPage() {
    this.setIncidentsCursor(undefined);

    this.fetchAlertGroups();
  }

  @action.bound
  async fetchAlertGroups(isPollingJob = false) {
    this.rootStore.loaderStore.setLoadingAction(
      isPollingJob ? ActionKey.FETCH_INCIDENTS_POLLING : ActionKey.FETCH_INCIDENTS,
      true
    );
    const timestamp = new Date().getTime();
    this.latestFetchAlertGroupsTimestamp = timestamp;
    const {
      results,
      next: nextRaw,
      previous: previousRaw,
      page_size,
    } = await makeRequest(`${this.path}`, {
      params: {
        ...this.incidentFilters,
        perpage: this.alertsSearchResult?.['default']?.page_size,
        cursor: this.incidentsCursor,
        is_root: true,
      },
    }).catch(refreshPageError);

    const prevCursor = previousRaw ? qs.parse(qs.extract(previousRaw)).cursor : previousRaw;
    const nextCursor = nextRaw ? qs.parse(qs.extract(nextRaw)).cursor : nextRaw;

    const newAlerts = new Map(
      results.map((alert: Alert) => {
        const oldAlert = this.alerts.get(alert.pk) || {};
        const mergedAlertData = { ...oldAlert, ...alert, undoAction: alert.undoAction };
        return [alert.pk, mergedAlertData];
      })
    );

    runInAction(() => {
      // If previous fetch took longer than the next one, we ignore result of the previous fetch
      if (timestamp !== this.latestFetchAlertGroupsTimestamp) {
        return;
      }
      // @ts-ignore
      this.alerts = new Map<number, Alert>([...this.alerts, ...newAlerts]);

      this.alertsSearchResult['default'] = {
        prev: prevCursor,
        next: nextCursor,
        results: results.map((alert: Alert) => alert.pk),
        page_size,
      };
      this.rootStore.loaderStore.setLoadingAction(
        [ActionKey.FETCH_INCIDENTS, ActionKey.FETCH_INCIDENTS_POLLING],
        false
      );
    });
  }

  getAlertSearchResult(query: string) {
    const result = this.alertsSearchResult[query];
    if (!result) {
      return {};
    }

    return {
      prev: result.prev,
      next: result.next,
      page_size: result.page_size,
      results: result.results.map((pk: Alert['pk']) => this.alerts.get(pk)),
    };
  }

  async getAlert(pk: Alert['pk']) {
    return await makeRequest(`${this.path}${pk}`, {}).then((alert: Alert) => {
      runInAction(() => {
        this.alerts.set(pk, alert);
      });

      return alert;
    });
  }

  async getPayloadForIncident(pk: Alert['pk']) {
    return await makeRequest(`/alerts/${pk}`, {});
  }

  @action.bound
  async getNewIncidentsStats() {
    const result = await makeRequest(`${this.path}stats/`, {
      params: {
        ...this.incidentFilters,
        status: [IncidentStatus.Firing],
      },
    });

    runInAction(() => {
      this.newIncidents = result;
    });
  }

  @action.bound
  async getAcknowledgedIncidentsStats() {
    const result = await makeRequest(`${this.path}stats/`, {
      params: {
        ...this.incidentFilters,
        status: [IncidentStatus.Acknowledged],
      },
    });

    runInAction(() => {
      this.acknowledgedIncidents = result;
    });
  }

  @action.bound
  async getResolvedIncidentsStats() {
    const result = await makeRequest(`${this.path}stats/`, {
      params: {
        ...this.incidentFilters,
        status: [IncidentStatus.Resolved],
      },
    });

    runInAction(() => {
      this.resolvedIncidents = result;
    });
  }

  @action.bound
  async getSilencedIncidentsStats() {
    const result = await makeRequest(`${this.path}stats/`, {
      params: {
        ...this.incidentFilters,
        status: [IncidentStatus.Silenced],
      },
    });

    runInAction(() => {
      this.silencedIncidents = result;
    });
  }

  @action.bound
  async doIncidentAction(alertId: Alert['pk'], action: AlertAction, isUndo = false, data?: any) {
    this.updateAlert(alertId, { loading: true });

    let undoAction = undefined;
    if (!isUndo) {
      switch (action) {
        case AlertAction.Acknowledge:
          undoAction = AlertAction.unAcknowledge;
          break;
        case AlertAction.unAcknowledge:
          undoAction = AlertAction.Acknowledge;
          break;
        case AlertAction.Resolve:
          undoAction = AlertAction.unResolve;
          break;
        case AlertAction.unResolve:
          undoAction = AlertAction.Resolve;
          break;
        case AlertAction.Silence:
          undoAction = AlertAction.unSilence;
          break;
        case AlertAction.unSilence:
          undoAction = AlertAction.Silence;
          break;
      }

      this.setLiveUpdatesPaused(true);
    }

    try {
      const result = await makeRequest(`/alertgroups/${alertId}/${action}/`, {
        method: 'POST',
        data,
      });

      this.updateAlert(alertId, {
        ...result,
        loading: false,
        undoAction,
      });
    } catch (e) {
      this.updateAlert(alertId, { loading: false });
      openErrorNotification(e.response.data?.detail || e.response.data);
    }
  }

  @action.bound
  async updateAlert(pk: Alert['pk'], value: Partial<Alert>) {
    this.alerts.set(pk, {
      ...(this.alerts.get(pk) as Alert),
      ...value,
    });
  }

  async unpageUser(alertId: Alert['pk'], userId: User['pk']) {
    return await makeRequest(`${this.path}${alertId}/unpage_user`, {
      method: 'POST',
      data: { user_id: userId },
    }).catch(this.onApiError);
  }

  @action.bound
  async fetchTableSettings(): Promise<void> {
    const tableSettings = await makeRequest('/alertgroup_table_settings', {});

    const { hidden, visible, default: isDefaultOrder } = tableSettings;

    runInAction(() => {
      this.isDefaultColumnOrder = isDefaultOrder;
      this.columns = [
        ...visible.map((item: AlertGroupColumn): AlertGroupColumn => ({ ...item, isVisible: true })),
        ...hidden.map((item: AlertGroupColumn): AlertGroupColumn => ({ ...item, isVisible: false })),
      ];
    });
  }

  @action.bound
  @AutoLoadingState(ActionKey.ADD_NEW_COLUMN_TO_ALERT_GROUP)
  async updateTableSettings(
    columns: { visible: AlertGroupColumn[]; hidden: AlertGroupColumn[] },
    isUserUpdate: boolean
  ): Promise<void> {
    const method = isUserUpdate ? 'PUT' : 'POST';

    const { default: isDefaultOrder } = await makeRequest('/alertgroup_table_settings', {
      method,
      data: { ...columns },
    });

    runInAction(() => {
      this.isDefaultColumnOrder = isDefaultOrder;
    });
  }

  async resetTableSettings(): Promise<void> {
    return await makeRequest('/alertgroup_table_settings/reset', { method: 'POST' }).catch(() =>
      openErrorNotification('There was an error resetting the table settings')
    );
  }

  async loadLabelsKeys(): Promise<Array<ApiSchemas['LabelKey']>> {
    return await makeRequest(`/alertgroups/labels/keys/`, {}).catch(() =>
      openErrorNotification('There was an error processing your request')
    );
  }

  async loadValuesForLabelKey(
    key: ApiSchemas['LabelKey']['id'],
    search = ''
  ): Promise<{ key: ApiSchemas['LabelKey']; values: Array<ApiSchemas['LabelValue']> }> {
    if (!key) {
      return { key: undefined, values: [] };
    }

    const result = await makeRequest(`/alertgroups/labels/id/${key}`, {
      params: { search },
    });

    const filteredValues = result.values.filter((v: ApiSchemas['LabelValue']) =>
      v.name.toLowerCase().includes(search.toLowerCase())
    );

    return { ...result, values: filteredValues };
  }
}
