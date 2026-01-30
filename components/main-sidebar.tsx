"use client";

import * as React from "react";
import { MessageSquare, Plus } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ModeToggle } from "./theme-toggle";
import Link from "next/link";
import { API } from "@/utils/api";
import { ChatSerialized } from "@/utils/schemas/chat";

export function MainSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const [chats, setChats] = React.useState<ChatSerialized[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchChats() {
      try {
        const response = await API.chats.list({ limit: 50, offset: 0 });
        setChats(response.results);
      } catch (error) {
        console.error("Failed to fetch chats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchChats();
  }, []);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/">
                <span className="text-base font-semibold">Nurse Assistant</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {loading ? (
            <SidebarMenuItem>
              <SidebarMenuButton disabled>
                <span>Loading chats...</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : chats.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton disabled>
                <span>No chats yet</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            chats.map((chat) => (
              <SidebarMenuItem key={chat.id}>
                <SidebarMenuButton asChild>
                  <Link href={`/chat/${chat.id}`}>
                    <MessageSquare />
                    <span>
                      {chat.messages[0]?.content.slice(0, 30) || "New Chat"}
                      {chat.messages[0]?.content.length > 30 ? "..." : ""}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <ModeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
