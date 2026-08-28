/** sessionStorage key ProjectsTabs persists the last projects-list URL
 * (tab/status filter included) to — read by ProjectsBackLink so any page
 * linking back to the projects list (the project detail page's "← Projects"
 * link, the building detail page's "Back to projects" link) lands on the
 * same tab/filter instead of always resetting to "All". */
export const PROJECTS_LIST_URL_STORAGE_KEY = "erp:lastProjectsListUrl";
