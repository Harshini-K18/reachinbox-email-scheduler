import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  CalendarDays,
  ChevronDown,
  Clock3,
  Download,
  Filter,
  Inbox,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Star,
  Trash2,
  Upload,
  LogOut,
} from "lucide-react";
import axios from "axios";

type EmailStatus = "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";

type Tab = "scheduled" | "sent";

type View = "list" | "detail" | "compose";

type MailFilters = {
  starred: boolean;
  archived: boolean;
  deleted: boolean;
};

type AttachmentPreview = {
  file: File;
  previewUrl?: string;
  dataUrl?: string;
};

type SavedAttachment = {
  name: string;
  type: string;
  dataUrl: string;
};

interface Email {
  id: string;
  recipient: string;
  subject: string;
  body?: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
  status: EmailStatus;
  attempts: number;
  messageId?: string | null;
  errorMessage?: string | null;
  starred?: boolean;
  folder?: "inbox" | "archived" | "deleted";
  attachments?: SavedAttachment[];
  campaign?: {
    attachments?: SavedAttachment[] | null;
  };
}

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://localhost:5000/api",
});

const AUTO_REFRESH_MS = 10000;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

type AuthUser = {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatar: string | null;
};

type AuthSession = {
  user: AuthUser;
  sender: { id: string; name: string; email: string } | null;
};

const AUTH_TOKEN_KEY = "reachinbox-google-credential";

api.interceptors.request.use((config) => {
  const credential = localStorage.getItem(AUTH_TOKEN_KEY);
  if (credential) {
    config.headers.Authorization = `Bearer ${credential}`;
  }
  return config;
});

function storedEmailIds(key: string) {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

function saveEmailIds(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

function savedAttachmentsFor(emailId: string): SavedAttachment[] {
  try {
    return JSON.parse(
      localStorage.getItem(`reachinbox-attachments-${emailId}`) ?? "[]"
    );
  } catch {
    return [];
  }
}

function saveAttachmentsFor(emailIds: string[], attachments: SavedAttachment[]) {
  if (!attachments.length) return;

  emailIds.forEach((emailId) => {
    try {
      localStorage.setItem(
        `reachinbox-attachments-${emailId}`,
        JSON.stringify(attachments)
      );
    } catch (error) {
      console.warn("Unable to save attachments locally:", error);
    }
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result ?? ""));
    };

    reader.onerror = () => {
      reject(new Error(`Unable to read file: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

function DashboardApp({ user, sender, onLogout }: { user: AuthUser; sender: AuthSession["sender"]; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("scheduled");
  const [view, setView] = useState<View>("list");

  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const latestRequest = useRef(0);
  const hiddenEmailIds = useRef(storedEmailIds("reachinbox-hidden-emails"));
  const starredEmailIds = useRef(storedEmailIds("reachinbox-starred-emails"));
  const archivedEmailIds = useRef(
    storedEmailIds("reachinbox-archived-emails")
  );
  const deletedEmailIds = useRef(
    storedEmailIds("reachinbox-deleted-emails")
  );

  const [filters, setFilters] = useState<MailFilters>({
    starred: false,
    archived: false,
    deleted: false,
  });

  const loadEmails = async (
    manual = false,
    silent = false
  ): Promise<void> => {
    const requestId = ++latestRequest.current;

    if (manual) {
      setRefreshing(true);
    }

    if (!silent && !manual) {
      setLoading(true);
    }

    try {
      const cacheBuster = Date.now();

      const [scheduledResponse, sentResponse] = await Promise.all([
        api.get("/emails/scheduled", {
          params: {
            _: cacheBuster,
          },
        }),

        api.get("/emails/sent", {
          params: {
            _: cacheBuster,
          },
        }),
      ]);

      if (requestId !== latestRequest.current) {
        return;
      }

      const decorateEmails = (items: Email[]): Email[] =>
        items
          .map((email): Email => ({
            ...email,
            starred: starredEmailIds.current.has(email.id),
            folder: deletedEmailIds.current.has(email.id)
              ? "deleted"
              : archivedEmailIds.current.has(email.id)
              ? "archived"
              : "inbox",
            attachments:
              email.attachments?.length
                ? email.attachments
                : email.campaign?.attachments?.length
                ? email.campaign.attachments
                : savedAttachmentsFor(email.id),
          }));

      setScheduledEmails(
        decorateEmails(scheduledResponse.data?.data ?? [])
      );
      setSentEmails(decorateEmails(sentResponse.data?.data ?? []));

      setError("");
    } catch (requestError) {
      console.error("Failed to load emails:", requestError);

      if (requestId === latestRequest.current) {
        setError(
          "Unable to update emails. Please make sure the backend is running."
        );
      }
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadEmails();

    const interval = window.setInterval(() => {
      void loadEmails(false, true);
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
      latestRequest.current += 1;
    };
  }, []);

  const emails =
    tab === "scheduled" ? scheduledEmails : sentEmails;

  const inboxEmails = useMemo(
    () =>
      emails.filter(
        (email) =>
          !hiddenEmailIds.current.has(email.id) &&
          email.folder === "inbox"
      ),
    [emails]
  );

  const filteredEmails = useMemo(() => {
    const hasFilter = filters.starred || filters.archived || filters.deleted;

    const categoryFiltered = hasFilter
      ? emails.filter((email) => {
          const matchesStarred =
            filters.starred && email.starred === true;
          const matchesArchived =
            filters.archived && email.folder === "archived";
          const matchesDeleted =
            filters.deleted && email.folder === "deleted";

          return matchesStarred || matchesArchived || matchesDeleted;
        })
      : inboxEmails;

    const term = search.trim().toLowerCase();

    if (!term) {
      return categoryFiltered;
    }

    return categoryFiltered.filter((email) => {
      const searchableText = [
        email.recipient,
        email.subject,
        email.body ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(term);
    });
  }, [emails, inboxEmails, search, filters]);

  const chooseTab = (nextTab: Tab) => {
    setTab(nextTab);
    setSelectedEmail(null);
    setView("list");
    setSearch("");
    setFilters({
      starred: false,
      archived: false,
      deleted: false,
    });
  };

  const toggleStar = (id: string) => {
    if (starredEmailIds.current.has(id)) {
      starredEmailIds.current.delete(id);
    } else {
      starredEmailIds.current.add(id);
    }
    saveEmailIds("reachinbox-starred-emails", starredEmailIds.current);

    const update = (emailsToUpdate: Email[]) =>
      emailsToUpdate.map((email) =>
        email.id === id
          ? { ...email, starred: !email.starred }
          : email
      );

    setScheduledEmails(update);
    setSentEmails(update);
    setSelectedEmail((current) =>
      current?.id === id
        ? { ...current, starred: !current.starred }
        : current
    );
  };

  const moveToFolder = (
    id: string,
    folder: "inbox" | "archived" | "deleted"
  ) => {
    // Keep the three folder states mutually exclusive in local storage.
    if (folder === "inbox") {
      archivedEmailIds.current.delete(id);
      deletedEmailIds.current.delete(id);

      saveEmailIds(
        "reachinbox-archived-emails",
        archivedEmailIds.current
      );
      saveEmailIds(
        "reachinbox-deleted-emails",
        deletedEmailIds.current
      );

      // If the user was looking at the Archived filter, remove that filter
      // after restoring the message so it immediately appears in Inbox.
      setFilters((current) => ({
        ...current,
        archived: false,
      }));
    } else if (folder === "archived") {
      archivedEmailIds.current.add(id);
      deletedEmailIds.current.delete(id);

      saveEmailIds(
        "reachinbox-archived-emails",
        archivedEmailIds.current
      );
      saveEmailIds(
        "reachinbox-deleted-emails",
        deletedEmailIds.current
      );
    } else {
      deletedEmailIds.current.add(id);
      archivedEmailIds.current.delete(id);

      saveEmailIds(
        "reachinbox-deleted-emails",
        deletedEmailIds.current
      );
      saveEmailIds(
        "reachinbox-archived-emails",
        archivedEmailIds.current
      );
    }

    const updateFolder = (items: Email[]) =>
      items.map((email) =>
        email.id === id
          ? { ...email, folder }
          : email
      );

    setScheduledEmails(updateFolder);
    setSentEmails(updateFolder);
    setSelectedEmail(null);
    setView("list");
  };

  const toggleFilter = (filter: keyof MailFilters) => {
    setFilters((current) => ({
      ...current,
      [filter]: !current[filter],
    }));
  };

  return (
    <div className="h-screen overflow-hidden bg-white font-sans text-[#202733]">
      <div className="flex h-full">
        <Sidebar
          tab={tab}
          scheduledCount={scheduledEmails.filter(
            (email) =>
              (email.status === "SCHEDULED" ||
                email.status === "PROCESSING") &&
              email.folder !== "deleted"
          ).length}
          sentCount={sentEmails.filter(
            (email) =>
              (email.status === "SENT" ||
                email.status === "FAILED") &&
              email.folder !== "deleted"
          ).length}
          onTabChange={chooseTab}
          onCompose={() => setView("compose")}
          user={user}
          onLogout={onLogout}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <MobileNav
            tab={tab}
            onTabChange={chooseTab}
            onCompose={() => setView("compose")}
            user={user}
            onLogout={onLogout}
          />
          {view === "compose" ? (
            <ComposeScreen
              senderEmail={sender?.email ?? user.email}
              onBack={() => setView("list")}
              onSuccess={() => {
                chooseTab("scheduled");
                void loadEmails(true);
              }}
            />
          ) : view === "detail" && selectedEmail ? (
            <EmailReader
              email={selectedEmail}
              onBack={() => setView("list")}
              onToggleStar={() => toggleStar(selectedEmail.id)}
              onArchive={() =>
                moveToFolder(
                  selectedEmail.id,
                  selectedEmail.folder === "archived"
                    ? "inbox"
                    : "archived"
                )
              }
              onDelete={() => moveToFolder(selectedEmail.id, "deleted")}
              user={user}
            />
          ) : (
            <InboxList
              tab={tab}
              emails={filteredEmails}
              search={search}
              loading={loading}
              refreshing={refreshing}
              error={error}
              onSearch={setSearch}
              filters={filters}
              onToggleFilter={toggleFilter}
              onRefresh={() => void loadEmails(true)}
              onOpen={(email) => {
                setSelectedEmail(email);
                setView("detail");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SIDEBAR                                                                    */
/* -------------------------------------------------------------------------- */

function Sidebar({
  tab,
  scheduledCount,
  sentCount,
  onTabChange,
  onCompose,
  user,
  onLogout,
}: {
  tab: Tab;
  scheduledCount: number;
  sentCount: number;
  onTabChange: (tab: Tab) => void;
  onCompose: () => void;
  user: AuthUser;
  onLogout: () => void;
}) {
  return (
    <aside className="hidden h-full w-[340px] shrink-0 flex-col border-r border-[#e8ebee] bg-white px-[28px] py-[28px] md:flex">
      {/* Logo */}
      <div className="flex items-center gap-[12px] px-[10px] pb-[24px]">
        <img src="/mail.gif" alt="ReachInbox" className="h-[42px] w-[42px] shrink-0" />
        <span className="text-[42px] font-semibold leading-[48px] tracking-[0.2px] text-[#1e7e5e]" style={{fontFamily: "'Segoe UI', 'Trebuchet MS', sans-serif", fontStyle: "normal", letterSpacing: "0.3px"}}>
          ReachInbox
        </span>
      </div>

      {/* User */}
      <div className="relative mb-[28px]">
        <button
          type="button"
          onClick={() => {
            const menu = document.getElementById("reachinbox-user-menu");
            menu?.classList.toggle("hidden");
          }}
          className="flex w-full items-center gap-[12px] rounded-[14px] bg-[#f5f7f7] px-[12px] py-[12px] text-left"
        >
          <Avatar name={user.name} src={user.avatar} large={true} />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-black leading-[19px] text-[#26313f]">
              {user.name}
            </span>

            <span className="block break-all text-[12px] font-semibold leading-[16px] text-[#8b95a0]">
              {user.email}
            </span>
          </span>

          <ChevronDown size={15} strokeWidth={1.7} className="text-[#9da6af]" />
        </button>

        <div id="reachinbox-user-menu" className="absolute left-0 right-0 top-[72px] z-50 hidden rounded-[11px] border border-[#e4e8ea] bg-white p-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-[10px] rounded-[8px] px-[12px] py-[10px] text-left text-[12px] font-semibold text-[#536071] hover:bg-[#f4f7f6] hover:text-[#d15e48]"
          >
            <LogOut size={15} strokeWidth={1.6} />
            Logout
          </button>
        </div>
      </div>

      {/* Compose */}
      <button
        type="button"
        onClick={onCompose}
        className="mb-[24px] h-[46px] w-full rounded-full border border-[#00ae52] bg-white text-[14px] font-bold text-[#009e4a] transition hover:bg-[#effbf4]"
      >
        Compose
      </button>

      {/* Core */}
      <p className="mb-[14px] px-[10px] text-[8px] font-medium uppercase tracking-[0.08em] text-[#a2aab3]">
        Core
      </p>

      <SidebarItem
        active={tab === "scheduled"}
        icon={<Clock3 size={14} strokeWidth={1.7} />}
        label="Scheduled"
        count={scheduledCount}
        onClick={() => onTabChange("scheduled")}
      />

      <SidebarItem
        active={tab === "sent"}
        icon={<Send size={14} strokeWidth={1.7} />}
        label="Sent"
        count={sentCount}
        onClick={() => onTabChange("sent")}
      />
    </aside>
  );
}

function MobileNav({
  tab,
  onTabChange,
  onCompose,
  user,
  onLogout,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onCompose: () => void;
  user: AuthUser;
  onLogout: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-[8px] border-b border-[#e8ebee] bg-white px-[12px] py-[10px] md:hidden">
      <div className="flex min-w-0 items-center gap-[8px]">
        <img src="/mail.gif" alt="ReachInbox" className="h-[30px] w-[30px] shrink-0" />
        <span className="truncate text-[20px] font-semibold text-[#1e7e5e]">ReachInbox</span>
      </div>
      <div className="flex shrink-0 items-center gap-[3px]">
        <button type="button" onClick={() => onTabChange("scheduled")}
          className={`rounded-full px-[8px] py-[6px] text-[10px] font-semibold ${tab === "scheduled" ? "bg-[#def4e8] text-[#25303d]" : "text-[#536071]"}`}>
          Scheduled
        </button>
        <button type="button" onClick={() => onTabChange("sent")}
          className={`rounded-full px-[8px] py-[6px] text-[10px] font-semibold ${tab === "sent" ? "bg-[#def4e8] text-[#25303d]" : "text-[#536071]"}`}>
          Sent
        </button>
        <button type="button" onClick={onCompose}
          className="rounded-full border border-[#00ad52] px-[9px] py-[6px] text-[10px] font-semibold text-[#009c49]">
          Compose
        </button>
        <button type="button" onClick={onLogout} aria-label={`Logout ${user.name}`}
          className="rounded-full px-[6px] py-[6px] text-[#8d98a6]">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}

function SidebarItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[48px] w-full items-center gap-[10px] rounded-[9px] px-[12px] text-left text-[13px] font-medium transition ${
        active
          ? "bg-[#def4e8] font-medium text-[#25303d]"
          : "text-[#536071] hover:bg-[#f5f7f7]"
      }`}
    >
      {icon}

      <span className="flex-1">{label}</span>

      <span className="text-[11px] font-bold text-[#7d8793]">
        {count}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* LIST                                                                        */
/* -------------------------------------------------------------------------- */

function InboxList({
  tab,
  emails,
  search,
  loading,
  refreshing,
  error,
  onSearch,
  filters,
  onToggleFilter,
  onRefresh,
  onOpen,
}: {
  tab: Tab;
  emails: Email[];
  search: string;
  loading: boolean;
  refreshing: boolean;
  error: string;
  filters: MailFilters;
  onSearch: (value: string) => void;
  onToggleFilter: (filter: keyof MailFilters) => void;
  onRefresh: () => void;
  onOpen: (email: Email) => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-white px-[12px] py-[12px] sm:px-[24px] sm:py-[16px]">
      {/* Search row */}
      <div className="flex w-full min-w-0 items-center gap-[8px] sm:gap-[12px]">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            strokeWidth={1.6}
            className="absolute left-[13px] top-1/2 -translate-y-1/2 text-[#aab3bd]"
          />

          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
            className="h-[42px] w-full rounded-full bg-[#f3f6f6] pl-[36px] pr-[12px] text-[13px] font-medium text-[#334052] outline-none placeholder:text-[#a5afba] focus:ring-1 focus:ring-[#d7f1e3]"
          />
        </div>

        <FilterMenu
          filters={filters}
          onToggleFilter={onToggleFilter}
        />

        <button
  type="button"
  onClick={onRefresh}
  disabled={refreshing}
  title="Refresh"
  aria-label="Refresh"
  className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-[#a0aab5] transition hover:bg-[#f3f6f6] hover:text-[#00a451] disabled:opacity-50"
>
  <RefreshCw
    size={20}
    strokeWidth={1.7}
    className={refreshing ? "animate-spin" : ""}
  />
</button>
      </div>

      {error && (
        <p className="mt-[20px] w-full text-[12px] font-medium text-[#d15e48]">
          {error}
        </p>
      )}

      {/* Email list */}
      <div className="mt-[20px] min-h-0 flex-1 overflow-y-auto border-t border-[#edf0f2]">
        {loading ? (
          <div className="py-[50px] text-center text-[13px] font-medium text-[#a4adb7]">
            Loading...
          </div>
        ) : emails.length === 0 ? (
          <div className="py-[60px] text-center text-[13px] font-medium text-[#9ba5b1]">
            No {tab} emails yet.
          </div>
        ) : (
          emails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              onClick={() => onOpen(email)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterMenu({
  filters,
  onToggleFilter,
}: {
  filters: MailFilters;
  onToggleFilter: (filter: keyof MailFilters) => void;
}) {
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="relative shrink-0">
     <button
  type="button"
  onClick={() => setOpen((current) => !current)}
  title="Filters"
  aria-label="Filters"
  className={`relative flex h-[36px] w-[36px] items-center justify-center rounded-full transition hover:bg-[#f3f6f6] ${
    activeCount
      ? "text-[#00a451]"
      : "text-[#a0aab5] hover:text-[#00a451]"
  }`}
>
  <Filter size={20} strokeWidth={1.7} />

  {activeCount > 0 && (
    <span className="absolute -right-[1px] -top-[1px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#00a451] px-[3px] text-[9px] font-medium text-white">
      {activeCount}
    </span>
  )}
</button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute left-0 top-[35px] z-40 w-[190px] rounded-[10px] border border-[#e4e8ea] bg-white p-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
            <p className="px-[7px] pb-[6px] text-[10px] font-medium text-[#596574]">
              Filter messages
            </p>

            {(
              [
                ["starred", "Starred"],
                ["archived", "Archived"],
                ["deleted", "Deleted"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-[8px] rounded-[7px] px-[7px] py-[7px] text-[11px] text-[#354052] hover:bg-[#f5f7f7]"
              >
                <input
                  type="checkbox"
                  checked={filters[key]}
                  onChange={() => onToggleFilter(key)}
                  className="h-[13px] w-[13px] accent-[#00a451]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmailRow({
  email,
  onClick,
}: {
  email: Email;
  onClick: () => void;
}) {
  const scheduled =
    email.status === "SCHEDULED" ||
    email.status === "PROCESSING";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[72px] w-full flex-wrap items-center gap-x-[10px] gap-y-[6px] border-b border-[#edf0f2] px-[8px] py-[12px] text-left transition hover:bg-[#fcfdfd] sm:flex-nowrap sm:gap-[16px] sm:px-[24px]"
    >
      <span className="w-[calc(100%-30px)] truncate text-[12px] font-bold text-[#354052] sm:w-[160px] sm:text-[13px]">
        To: {email.recipient}
      </span>

      <span
        className={`shrink-0 rounded-full px-[10px] py-[5px] text-[11px] font-bold ${
          scheduled
            ? "bg-[#fff0df] text-[#ef6d2d]"
            : "bg-[#eef1f4] text-[#647081]"
        }`}
      >
        {scheduled
          ? formatScheduledTime(email.scheduledAt)
          : "Sent"}
      </span>

      <span className="min-w-0 flex-1 text-[13px] text-[#283343]">
        <span className="font-bold">
          {email.subject || "(No subject)"}
        </span>

        <span className="text-[#a4adb8]">
          {" "}
          - {email.body
            ? email.body.replace(/\s+/g, " ").substring(0, 60) +
              (email.body.length > 60 ? "..." : "")
            : ""}
        </span>
      </span>

      <Star
        size={18}
        strokeWidth={1.5}
        fill={email.starred ? "currentColor" : "none"}
        className={`shrink-0 transition group-hover:text-[#efb53c] ${email.starred ? "text-[#efb53c]" : "text-[#cdd4dc]"}`}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* EMAIL READER                                                                */
/* -------------------------------------------------------------------------- */

function EmailReader({
  email,
  onBack,
  onToggleStar,
  onArchive,
  onDelete,
  user,
}: {
  email: Email;
  onBack: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
  user: AuthUser;
}) {
  return (
    <div className="h-full overflow-y-auto bg-white px-[12px] py-[12px] sm:px-[30px] sm:py-[15px]">
      {/* Top */}
      <div className="flex items-center justify-between border-b border-[#eff1f3] pb-[14px]">
        <div className="flex min-w-0 items-center gap-[10px]">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="text-[#26313e] transition hover:text-[#00a451]"
          >
            <ArrowLeft size={20} strokeWidth={1.6} />
          </button>

          <h1 className="min-w-0 truncate text-[17px] font-normal tracking-[-0.02em] text-[#202a38] sm:text-[20px]">
            {email.subject || "(No subject)"}
          </h1>
        </div>

        <div className="flex items-center gap-[8px] text-[#a9b2bc]">
          <button type="button" onClick={onToggleStar} title="Star email" className={`rounded p-[5px] transition hover:bg-[#f4f7f6] ${email.starred ? "text-[#e8a928]" : "hover:text-[#e8a928]"}`}>
            <Star size={15} strokeWidth={1.5} fill={email.starred ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={onArchive}
            title={email.folder === "archived" ? "Move to Inbox" : "Archive email"}
            aria-label={email.folder === "archived" ? "Move to Inbox" : "Archive email"}
            className="rounded p-[5px] transition hover:bg-[#f4f7f6] hover:text-[#00a451]"
          >
            {email.folder === "archived" ? (
              <Inbox size={15} strokeWidth={1.5} />
            ) : (
              <Archive size={15} strokeWidth={1.5} />
            )}
          </button>
          <button type="button" onClick={onDelete} title="Delete email" className="rounded p-[5px] transition hover:bg-[#fff2ef] hover:text-[#d15e48]">
            <Trash2 size={15} strokeWidth={1.5} />
          </button>

          <Avatar name={user.name} src={user.avatar} />
        </div>
      </div>

      {/* Message */}
      <article className="mx-auto w-full max-w-[760px] pt-[20px] sm:pt-[27px]">
        <div className="flex items-start justify-between gap-[20px]">
          <div className="flex items-start gap-[10px]">
            <Avatar
              name={email.recipient}
              large
            />

            <div>
              <p className="text-[13px] font-semibold text-[#273344]">
                {email.recipient}
              </p>

              <p className="mt-[2px] text-[11px] text-[#8d98a6]">
                to me
              </p>
            </div>
          </div>

          <p className="text-[11px] text-[#7d8897]">
            {formatFullDate(
              email.sentAt ?? email.scheduledAt
            )}
          </p>
        </div>

        <div
          className="mt-[20px] max-w-[620px] break-words text-[13px] leading-[1.8] text-[#354154] sm:ml-[42px] sm:mt-[27px] sm:leading-[1.9]"
          dangerouslySetInnerHTML={{
            __html: formatEmailBody(
              email.body || "No email content was supplied."
            ),
          }}
        />

        {(email.attachments ?? savedAttachmentsFor(email.id)).length > 0 && (
          <div className="mt-[20px] max-w-[620px] sm:ml-[42px]">
            <p className="mb-[8px] text-[10px] font-medium uppercase tracking-[0.08em] text-[#8d98a6]">
              Attachments
            </p>

            <div className="flex flex-wrap gap-[12px]">
              {(email.attachments ?? savedAttachmentsFor(email.id)).map((attachment, index) => {
                const isImage = attachment.type.startsWith("image/");
                const isPdf = attachment.type === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf");
                const displayUrl = attachment.dataUrl;

                return (
                  <div
                    key={`${attachment.name}-${index}`}
                    className="group block w-full max-w-[220px] overflow-hidden rounded-[10px] border border-[#e5ebef] bg-[#fafcfc] text-left shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition hover:border-[#9fd7b8] hover:shadow-[0_6px_18px_rgba(0,113,77,0.08)]"
                  >
                    {isImage ? (
                      <img
                        src={displayUrl}
                        alt={attachment.name}
                        className="h-[120px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-[120px] w-full items-center justify-center bg-[linear-gradient(135deg,#eef4ff,#edf5ef)]">
                        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#d7e4ff] bg-white text-[11px] font-bold text-[#3e6ee8] shadow-sm">
                          {isPdf ? "PDF" : attachment.name.split(".").pop()?.toUpperCase() || "FILE"}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-[8px] px-[10px] py-[8px] text-[11px] text-[#2d3947]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{attachment.name}</p>
                        <p className="mt-[2px] text-[9px] text-[#8d98a6]">
                          {formatFileSize(attachment.dataUrl)}
                        </p>
                      </div>

                      <a
                        href={displayUrl}
                        download={attachment.name}
                        title={`Download ${attachment.name}`}
                        aria-label={`Download ${attachment.name}`}
                        className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[#4a9d73] transition hover:bg-[#edf9f2] hover:text-[#16834e]"
                      >
                        <Download size={15} strokeWidth={1.7} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {email.status === "FAILED" &&
          email.errorMessage && (
            <p className="mt-[20px] rounded-md sm:ml-[42px] bg-[#fff3ef] px-[14px] py-[10px] text-[11px] text-[#cc5f48]">
              {email.errorMessage}
            </p>
          )}
      </article>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPOSE                                                                     */
/* -------------------------------------------------------------------------- */

function ComposeScreen({
  senderEmail,
  onBack,
  onSuccess,
}: {
  senderEmail: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(20);

  const [startTime, setStartTime] = useState(() =>
    localDateTime(5)
  );

  const [showSchedule, setShowSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const uploadRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const bodyHistory = useRef<string[]>([""]);
  const historyIndex = useRef(0);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);

  const addRecipient = (value: string) => {
    const cleaned = value.trim();

    if (!cleaned) {
      return;
    }

    const parts = cleaned
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const valid = parts.filter((email) =>
      /^\S+@\S+\.\S+$/.test(email)
    );

    setRecipients((current) => {
      const combined = [...current, ...valid];

      return Array.from(
        new Set(combined.map((item) => item.toLowerCase()))
      );
    });

    setRecipientInput("");
  };

  const removeRecipient = (recipient: string) => {
    setRecipients((current) =>
      current.filter((item) => item !== recipient)
    );
  };

  const handleRecipientKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === "Enter" ||
      event.key === "," ||
      event.key === ";"
    ) {
      event.preventDefault();
      addRecipient(recipientInput);
    }
  };

  const importRecipients = (file?: File) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result ?? "");

      const foundEmails =
        text.match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
        ) ?? [];

      setRecipients((current) => {
        return Array.from(
          new Set([
            ...current,
            ...foundEmails.map((item) =>
              item.toLowerCase()
            ),
          ])
        );
      });
    };

    reader.readAsText(file);
  };

  const submit = async () => {
    if (recipientInput.trim()) {
      addRecipient(recipientInput);
    }

    const finalRecipients = recipientInput.trim()
      ? Array.from(
          new Set([
            ...recipients,
            ...recipientInput
              .split(/[\n,;]+/)
              .map((item) => item.trim().toLowerCase())
              .filter((item) =>
                /^\S+@\S+\.\S+$/.test(item)
              ),
          ])
        )
      : recipients;

    if (
      !finalRecipients.length ||
      !subject.trim() ||
      !body.trim()
    ) {
      setError(
        "Please add recipient, subject and message."
      );
      return;
    }

    if (new Date(startTime).getTime() <= Date.now()) {
      setError("Please select a future date and time.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const attachmentPayload = await Promise.all(
        attachments.map(async ({ file }) => ({
          name: file.name,
          type: file.type || "application/octet-stream",
          dataUrl: await readFileAsDataUrl(file),
        }))
      );

      const response = await api.post("/emails/schedule", {
        subject: subject.trim(),
        body: body.trim(),
        startTime: new Date(startTime).toISOString(),
        delayMs,
        hourlyLimit,
        recipients: finalRecipients,
        idempotencyKey: `campaign-${Date.now()}`,
        attachments: attachmentPayload,
      });

      const emailIds = Array.isArray(response?.data?.data?.emails)
        ? response.data.data.emails
            .map((email: { id?: string }) => email.id)
            .filter(Boolean)
        : [];

      if (emailIds.length && attachmentPayload.length) {
        saveAttachmentsFor(emailIds, attachmentPayload);
      }

      onSuccess();
    } catch (submitError) {
      console.error(submitError);

      setError(
        axios.isAxiosError(submitError)
          ? submitError.response?.data?.message ??
              "Unable to schedule email."
          : "Unable to schedule email."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setQuickTime = (hoursFromNow: number) => {
    const date = new Date(
      Date.now() + hoursFromNow * 60 * 60 * 1000
    );

    date.setSeconds(0, 0);

    const localValue = new Date(
      date.getTime() -
        date.getTimezoneOffset() * 60_000
    )
      .toISOString()
      .slice(0, 16);

    setStartTime(localValue);
  };

  const updateBody = (value: string) => {
    const nextHistory = bodyHistory.current.slice(
      0,
      historyIndex.current + 1
    );

    nextHistory.push(value);
    bodyHistory.current = nextHistory.slice(-50);
    historyIndex.current = bodyHistory.current.length - 1;
    setBody(value);
  };

  const undoBody = () => {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    setBody(bodyHistory.current[historyIndex.current]);
  };

  const redoBody = () => {
    if (historyIndex.current >= bodyHistory.current.length - 1) return;
    historyIndex.current += 1;
    setBody(bodyHistory.current[historyIndex.current]);
  };

  const wrapSelection = (before: string, after = before) => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? body.length;
    const end = editor?.selectionEnd ?? body.length;
    const selected = body.slice(start, end) || "text";
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    updateBody(next);

    window.requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const addPrefixToLines = (prefix: string) => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? 0;
    const end = editor?.selectionEnd ?? body.length;
    const selected = body.slice(start, end) || "text";
    const next = `${body.slice(0, start)}${selected.split("\n").map((line) => `${prefix}${line}`).join("\n")}${body.slice(end)}`;
    updateBody(next);
  };

  const addAttachments = async (files?: FileList | null) => {
    if (!files?.length) return;

    const mapped = await Promise.all(
      Array.from(files).map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);

        return {
          file,
          dataUrl,
          previewUrl: file.type.startsWith("image/") ? dataUrl : undefined,
        };
      })
    );

    setAttachments((current) => [...current, ...mapped]);
  };

  return (
    <div className="h-full overflow-y-auto bg-white px-[12px] py-[12px] sm:px-[24px] sm:py-[16px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[9px]">
          <button
            type="button"
            onClick={onBack}
            className="text-[#202b39] transition hover:text-[#00a451]"
            aria-label="Back"
          >
            <ArrowLeft
              size={20}
              strokeWidth={1.6}
            />
          </button>

          <h1 className="text-[20px] font-normal tracking-[-0.02em] text-[#202a38]">
            Compose New Email
          </h1>
        </div>

        <div className="relative flex shrink-0 items-center gap-[10px] sm:gap-[16px]">
          <button
            type="button"
            title="Attach"
            onClick={() => attachmentRef.current?.click()}
            className="text-[#00a451]"
          >
            <Paperclip
              size={17}
              strokeWidth={1.6}
            />
          </button>

          <input
            ref={attachmentRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addAttachments(event.target.files);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            title="Schedule"
            onClick={() =>
              setShowSchedule((current) => !current)
            }
            className="text-[#00a451]"
          >
            <Clock3
              size={17}
              strokeWidth={1.6}
            />
          </button>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-full border border-[#00ad52] px-[16px] py-[6px] text-[11px] font-medium text-[#009c49] transition hover:bg-[#effbf4] disabled:opacity-50"
          >
            {submitting
              ? "Sending..."
              : showSchedule
              ? "Send"
              : "Send Later"}
          </button>

          {showSchedule && (
            <SchedulePopover
              startTime={startTime}
              setStartTime={setStartTime}
              setQuickTime={setQuickTime}
              onCancel={() => setShowSchedule(false)}
              onDone={() => setShowSchedule(false)}
            />
          )}
        </div>
      </div>

      {/* Form */}
      <div className="mx-auto mt-[20px] w-full max-w-[800px] sm:mt-[27px]">
        {error && (
          <p className="mb-[10px] text-[10px] text-[#ce5d46]">
            {error}
          </p>
        )}

        {/* From */}
        <div className="grid grid-cols-[42px_1fr] items-center gap-x-[0px] border-b border-[#e8edf0] py-[10px] text-[11px]">
          <label className="text-[#26313f]">
            From
          </label>

          <button
            type="button"
            className="flex max-w-full min-w-0 items-center rounded-[7px] bg-[#f3f5f5] px-[9px] py-[7px] text-[11px] text-[#293446]"
          >
            <span className="min-w-0 truncate">{senderEmail}</span>
            <ChevronDown
              size={11}
              className="ml-[5px] text-[#9ca5ae]"
            />
          </button>
        </div>

        {/* To */}
        <div className="grid grid-cols-[42px_1fr] items-start border-b border-[#e8edf0] py-[10px] text-[11px]">
          <label className="pt-[6px] text-[#26313f]">
            To
          </label>

          <div>
            <div className="flex min-h-[30px] min-w-0 flex-wrap items-center gap-[4px]">
              {recipients.map((recipient) => (
                <button
                  type="button"
                  key={recipient}
                  onClick={() =>
                    removeRecipient(recipient)
                  }
                  className="rounded-full border border-[#18bc69] bg-[#f0fff7] px-[8px] py-[3px] text-[10px] text-[#149c57]"
                  title="Remove recipient"
                >
                  {recipient}
                </button>
              ))}

              <input
                value={recipientInput}
                onChange={(event) =>
                  setRecipientInput(event.target.value)
                }
                onKeyDown={handleRecipientKeyDown}
                onBlur={() =>
                  recipientInput.trim() &&
                  addRecipient(recipientInput)
                }
                placeholder={
                  recipients.length
                    ? ""
                    : "recipient@example.com"
                }
                className="min-w-[120px] flex-1 bg-transparent py-[4px] outline-none placeholder:text-[#abb3bd]"
              />

              <button
                type="button"
                onClick={() =>
                  uploadRef.current?.click()
                }
                className="flex items-center gap-[4px] text-[#00a451]"
              >
                <Upload
                  size={12}
                  strokeWidth={1.5}
                />
                Upload List
              </button>

              <input
                ref={uploadRef}
                type="file"
                accept=".txt,.csv"
                className="hidden"
                onChange={(event) => {
                  void importRecipients(
                    event.target.files?.[0]
                  );
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        {/* Subject */}
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center border-b border-[#e8edf0] py-[10px] text-[11px]">
          <label className="text-[#26313f]">
            Subject
          </label>

          <input
            value={subject}
            onChange={(event) =>
              setSubject(event.target.value)
            }
            placeholder="Subject"
            className="min-w-0 w-full bg-transparent py-[4px] outline-none placeholder:text-[#abb3bd]"
          />
        </div>

        {/* Delay + Hourly */}
        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-[10px] py-[12px] text-[11px]">
          <label className="flex items-center gap-[8px] text-[#26313f]">
            Delay between 2 emails

            <input
              type="number"
              min="1000"
              step="1000"
              value={delayMs}
              onChange={(event) =>
                setDelayMs(Number(event.target.value))
              }
              className="h-[30px] w-[54px] rounded-[6px] border border-[#e3e8ec] px-[8px] text-[#687487] outline-none"
            />
          </label>

          <label className="flex items-center gap-[8px] text-[#26313f]">
            Hourly Limit

            <input
              type="number"
              min="1"
              value={hourlyLimit}
              onChange={(event) =>
                setHourlyLimit(
                  Number(event.target.value)
                )
              }
              className="h-[30px] w-[54px] rounded-[6px] border border-[#e3e8ec] px-[8px] text-[#687487] outline-none"
            />
          </label>
        </div>

        {/* Editor */}
        <div className="rounded-[8px] bg-[#fafafa] p-[10px]">
          <p className="mb-[10px] px-[3px] text-[11px] text-[#a8b0b9]">
            Type Your Reply...
          </p>

          <div className="mb-[8px] hidden h-[30px] items-center gap-[16px] rounded-full bg-white px-[12px] text-[#8d98a5]">
            <span>↶</span>
            <span>↷</span>

            <span className="border-l border-[#e6e9eb] pl-[15px]">
              Tᵀ
            </span>

            <b className="font-semibold">B</b>

            <i>I</i>

            <u>U</u>

            <span>☷</span>

            <span>☷</span>

            <span>❝</span>

            <span>▤</span>

            <span>—</span>
          </div>

          <div className="mb-[8px] flex min-h-[30px] flex-wrap items-center gap-[3px] rounded-full bg-white px-[8px] py-[3px] text-[#8d98a5]">
            <button type="button" onClick={undoBody} title="Undo" className="rounded px-[6px] hover:bg-[#f1f4f3]">Undo</button>
            <button type="button" onClick={redoBody} title="Redo" className="rounded px-[6px] hover:bg-[#f1f4f3]">Redo</button>
            <span className="mx-[3px] h-[16px] border-l border-[#e6e9eb]" />
            <button type="button" onClick={() => addPrefixToLines("## ")} title="Heading" className="rounded px-[6px] hover:bg-[#f1f4f3]">Tt</button>
            <button type="button" onClick={() => wrapSelection("**")} title="Bold" className="rounded px-[6px] font-semibold hover:bg-[#f1f4f3]">B</button>
            <button type="button" onClick={() => wrapSelection("_")} title="Italic" className="rounded px-[6px] italic hover:bg-[#f1f4f3]">I</button>
            <button type="button" onClick={() => wrapSelection("__")} title="Underline" className="rounded px-[6px] underline hover:bg-[#f1f4f3]">U</button>
            <button type="button" onClick={() => addPrefixToLines("- ")} title="Bulleted list" className="rounded px-[6px] hover:bg-[#f1f4f3]">List</button>
            <button type="button" onClick={() => addPrefixToLines("1. ")} title="Numbered list" className="rounded px-[6px] hover:bg-[#f1f4f3]">1.</button>
            <button type="button" onClick={() => addPrefixToLines("> ")} title="Quote" className="rounded px-[6px] hover:bg-[#f1f4f3]">Quote</button>
            <button type="button" onClick={() => updateBody("")} title="Clear message" className="rounded px-[6px] hover:bg-[#fff1ee] hover:text-[#d15e48]">Clear</button>
          </div>

          <textarea
            ref={editorRef}
            value={body}
            onChange={(event) => updateBody(event.target.value)}
            aria-label="Email message"
            className="h-[285px] w-full max-w-full resize-none break-words bg-transparent p-[8px] text-[13px] leading-[1.7] text-[#344052] outline-none"
          />
        </div>

        {attachments.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[8px]">
            {attachments.map((attachment, index) => (
              <button
                type="button"
                key={`${attachment.file.name}-${index}`}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                title="Remove attachment"
                className="flex max-w-[180px] items-center gap-[6px] rounded-[7px] border border-[#e1e7e4] bg-[#f7fbf8] px-[9px] py-[6px] text-[10px] text-[#4f5e6a]"
              >
                {attachment.previewUrl || attachment.dataUrl ? (
                  <img
                    src={attachment.previewUrl ?? attachment.dataUrl}
                    alt="Attachment preview"
                    className="h-[32px] w-[32px] rounded-[4px] object-cover"
                  />
                ) : (
                  <Paperclip size={12} className="text-[#00a451]" />
                )}
                <span className="truncate">{attachment.file.name}</span>
                <span className="text-[#00a451]">×</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SEND LATER POPUP                                                           */
/* -------------------------------------------------------------------------- */

function SchedulePopover({
  startTime,
  setStartTime,
  setQuickTime,
  onCancel,
  onDone,
}: {
  startTime: string;
  setStartTime: (value: string) => void;
  setQuickTime: (hours: number) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <div className="absolute right-0 top-[38px] z-50 w-[min(246px,calc(100vw-24px))] rounded-[7px] border border-[#e0e3e5] bg-white p-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.12)]">
      <p className="mb-[18px] text-[13px] font-medium text-[#26313f]">
        Send Later
      </p>

      <label className="block text-[10px] text-[#858f9b]">
        Pick date &amp; time
      </label>

      <div className="relative mt-[5px] border-b border-[#e7e9eb] pb-[8px]">
        <input
          type="datetime-local"
          value={startTime}
          onChange={(event) =>
            setStartTime(event.target.value)
          }
          className="w-full bg-transparent text-[10px] text-[#596575] outline-none"
        />

        <CalendarDays
          size={13}
          className="pointer-events-none absolute right-[2px] top-1/2 -translate-y-1/2 text-[#8c96a1]"
        />
      </div>

      <button
        type="button"
        onClick={() => setQuickTime(24)}
        className="mt-[11px] block w-full text-left text-[11px] text-[#596575] hover:text-[#00a451]"
      >
        Tomorrow
      </button>

      <button
        type="button"
        onClick={() => setQuickTime(34)}
        className="mt-[12px] block w-full text-left text-[11px] text-[#596575] hover:text-[#00a451]"
      >
        Tomorrow, 10:00 AM
      </button>

      <button
        type="button"
        onClick={() => setQuickTime(35)}
        className="mt-[12px] block w-full text-left text-[11px] text-[#596575] hover:text-[#00a451]"
      >
        Tomorrow, 11:00 AM
      </button>

      <button
        type="button"
        onClick={() => setQuickTime(39)}
        className="mt-[12px] block w-full text-left text-[11px] text-[#596575] hover:text-[#00a451]"
      >
        Tomorrow, 3:00 PM
      </button>

      <div className="mt-[43px] flex items-center justify-end gap-[20px]">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-[#293443]"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-[#16b960] px-[17px] py-[5px] text-[11px] text-[#00a451]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AVATAR / DATE                                                               */
/* -------------------------------------------------------------------------- */

function formatFileSize(dataUrl: string) {
  if (!dataUrl) return "0 KB";

  const base64 = dataUrl.split(",")[1] ?? "";
  const padding = (base64.match(/=*$/)?.[0].length ?? 0);
  const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEmailBody(value: string) {
  return value
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) {
        return `<h2 class="mb-2 mt-4 text-[1.25em] font-semibold text-[#202a38]">${formatInline(line.slice(3))}</h2>`;
      }

      if (line.startsWith("- ")) {
        return `<p class="pl-4 before:mr-2 before:content-['•']">${formatInline(line.slice(2))}</p>`;
      }

      const numbered = line.match(/^(\d+)\.\s+(.*)$/);
      if (numbered) {
        return `<p class="pl-4"><span class="mr-2">${numbered[1]}.</span>${formatInline(numbered[2])}</p>`;
      }

      return line.trim()
        ? `<p class="mb-3">${formatInline(line)}</p>`
        : "<br />";
    })
    .join("");
}

function formatInline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function Avatar({
  name,
  src,
  large = false,
}: {
  name: string;
  src?: string | null;
  large?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "O";

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${
          large ? "h-[40px] w-[40px]" : "h-[25px] w-[25px]"
        }`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#08b95b] font-medium text-white ${
        large ? "h-[40px] w-[40px] text-[16px]" : "h-[25px] w-[25px] text-[9px]"
      }`}
    >
      {initial}
    </span>
  );
}

function formatScheduledTime(
  value?: string | null
) {
  if (!value) {
    return "Scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Scheduled";
  }

  return `${date.toLocaleDateString([], {
    weekday: "short",
  })} ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function formatFullDate(
  value?: string | null
) {
  if (!value) {
    return "Scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Scheduled";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localDateTime(
  minutesFromNow: number
) {
  const date = new Date(
    Date.now() + minutesFromNow * 60_000
  );

  date.setSeconds(0, 0);

  return new Date(
    date.getTime() -
      date.getTimezoneOffset() * 60_000
  )
    .toISOString()
    .slice(0, 16);
}

function LoginScreen({
  onLoggedIn,
}: {
  onLoggedIn: (session: AuthSession, credential: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Email and password are required.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? {
              email: trimmedEmail,
              password: trimmedPassword,
            }
          : {
              email: trimmedEmail,
              password: trimmedPassword,
              name: name.trim() || trimmedEmail.split("@")[0],
            };

      const result = await api.post(endpoint, payload);

      const session = result.data?.data;

      if (!session?.user) {
        throw new Error("Invalid auth response");
      }

      onLoggedIn(session, session.token ?? "");
    } catch (loginError) {
      console.error("Email auth failed:", loginError);

      const serverMessage = axios.isAxiosError(loginError)
        ? loginError.response?.data?.message ?? "Unable to sign in."
        : "Unable to sign in.";

      setError(serverMessage);

      // Auto-switch to signup only if trying to login and no password account exists
      if (
        serverMessage.includes("No email/password account exists") &&
        mode === "login"
      ) {
        setMode("signup");
      }
      // Do not auto-switch for "Account already exists" — keep user in current mode so they see the error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const renderGoogleButton = () => {
      if (
        cancelled ||
        !googleButtonRef.current ||
        !(window as any).google?.accounts?.id
      ) {
        return;
      }

      const google = (window as any).google;

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          try {
            setLoading(true);
            setError("");

            const result = await api.post("/auth/google", {
              credential: response.credential,
            });

            const data = result.data?.data;

            if (!data?.user) {
              throw new Error("Invalid login response");
            }

            onLoggedIn(data, response.credential);
          } catch (loginError) {
            console.error("Google login failed:", loginError);

            setError(
              axios.isAxiosError(loginError)
                ? loginError.response?.data?.message ??
                    "Unable to sign in with Google."
                : "Unable to sign in with Google."
            );
          } finally {
            setLoading(false);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      googleButtonRef.current.innerHTML = "";

      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 288,
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
      });
    };

    if ((window as any).google?.accounts?.id) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    const script = existing ?? document.createElement("script");

    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", renderGoogleButton);

    return () => {
      cancelled = true;
      script.removeEventListener("load", renderGoogleButton);
    };
  }, [onLoggedIn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white font-sans text-[#202733]">
      <div className="w-full max-w-[378px] rounded-[8px] border border-[#e4e7e9] bg-white px-[44px] py-[40px]">
        <h1 className="mb-[22px] text-center text-[30px] font-semibold leading-none text-[#20252b]">
          Login
        </h1>

        <div className="flex h-[38px] w-full items-center justify-center overflow-hidden rounded-[8px] bg-[#def5e8]">
          <div ref={googleButtonRef} />
        </div>

        {loading && (
          <p className="mt-[9px] text-center text-[10px] text-[#8b95a0]">
            Signing in...
          </p>
        )}

        {error && (
          <p className="mt-[9px] text-center text-[10px] text-[#d15e48]">
            {error}
          </p>
        )}

        <div className="my-[18px] flex items-center gap-[14px] text-[10px] text-[#b0b5ba]">
          <span className="h-px flex-1 bg-[#eceeef]" />
          <span>{mode === "login" ? "or sign up through email" : "create a password account"}</span>
          <span className="h-px flex-1 bg-[#eceeef]" />
        </div>

        {mode === "signup" && (
          <input
            aria-label="Full name"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mb-[9px] h-[43px] w-full rounded-[8px] bg-[#f3f6f5] px-[15px] text-[11px] text-[#536071] outline-none placeholder:text-[#7d8791]"
          />
        )}

        <input
          aria-label="Email ID"
          placeholder="Email ID"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-[9px] h-[43px] w-full rounded-[8px] bg-[#f3f6f5] px-[15px] text-[11px] text-[#536071] outline-none placeholder:text-[#7d8791]"
        />

        <input
          aria-label="Password"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-[20px] h-[43px] w-full rounded-[8px] bg-[#f3f6f5] px-[15px] text-[11px] text-[#536071] outline-none placeholder:text-[#7d8791]"
        />

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleEmailAuth()}
          className="h-[38px] w-full rounded-[8px] bg-[#00b448] text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading
            ? mode === "login"
              ? "Signing in..."
              : "Creating account..."
            : mode === "login"
            ? "Login"
            : "Create account"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "signup" : "login"));
            setError("");
          }}
          className="mt-[12px] w-full text-center text-[10px] font-medium text-[#2a7ef6] underline-offset-2 hover:underline"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const credential = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!credential) {
      setCheckingSession(false);
      return;
    }

    api
      .get("/auth/me")
      .then((response) => {
        const data = response.data?.data;

        if (!data?.user) {
          throw new Error("Invalid session");
        }

        setSession(data);
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setSession(null);
      })
      .finally(() => {
        setCheckingSession(false);
      });
  }, []);

  const handleLoggedIn = (
    nextSession: AuthSession,
    credential: string
  ) => {
    localStorage.setItem(AUTH_TOKEN_KEY, credential);
    setSession(nextSession);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);

    try {
      (window as any).google?.accounts?.id?.disableAutoSelect?.();
    } catch {
      // Ignore Google SDK cleanup errors.
    }

    setSession(null);
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[12px] text-[#9aa3ad]">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  return (
    <DashboardApp
      user={session.user}
      sender={session.sender}
      onLogout={handleLogout}
    />
  );
}

export default App;