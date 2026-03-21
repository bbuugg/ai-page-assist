import type { ToolDef } from './types';
import { def as get_element_html } from './definitions/get_element_html';
import { def as get_element_css } from './definitions/get_element_css';
import { def as get_full_page_html } from './definitions/get_full_page_html';
import { def as execute_js } from './definitions/execute_js';
import { def as fill_input } from './definitions/fill_input';
import { def as click_element } from './definitions/click_element';
import { def as open_url } from './definitions/open_url';
import { def as scroll_page } from './definitions/scroll_page';
import { def as get_current_datetime } from './definitions/get_current_datetime';
import { def as fetch_url } from './definitions/fetch_url';
import { def as query_page } from './definitions/query_page';
import { def as ask_user } from './definitions/ask_user';
import { def as go_back } from './definitions/go_back';
import { def as go_forward } from './definitions/go_forward';
import { def as refresh } from './definitions/refresh';
import { def as send_keys } from './definitions/send_keys';
import { def as hover_element } from './definitions/hover_element';
import { def as select_option } from './definitions/select_option';
import { def as clear_input } from './definitions/clear_input';
import { def as wait_for_element } from './definitions/wait_for_element';
import { def as open_tab } from './definitions/open_tab';
import { def as close_tab } from './definitions/close_tab';
import { def as switch_tab } from './definitions/switch_tab';
import { def as list_tabs } from './definitions/list_tabs';
import { def as get_dom_state } from './definitions/get_dom_state';
import { def as get_page_context } from './definitions/get_page_context';
import { def as drag_and_drop } from './definitions/drag_and_drop';
import { def as scroll_to_element } from './definitions/scroll_to_element';
import { def as extract_page_elements } from './definitions/extract_page_elements';

export const ALL_TOOLS: ToolDef[] = [
  get_element_html,
  get_element_css,
  get_full_page_html,
  execute_js,
  fill_input,
  click_element,
  open_url,
  scroll_page,
  get_current_datetime,
  fetch_url,
  query_page,
  ask_user,
  go_back,
  go_forward,
  refresh,
  send_keys,
  hover_element,
  select_option,
  clear_input,
  wait_for_element,
  open_tab,
  close_tab,
  switch_tab,
  list_tabs,
  get_dom_state,
  get_page_context,
  drag_and_drop,
  scroll_to_element,
  extract_page_elements,
];

export const TOOL_MAP = new Map<string, ToolDef>(ALL_TOOLS.map((t) => [t.name, t]));
