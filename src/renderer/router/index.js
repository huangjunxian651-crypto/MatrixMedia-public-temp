import Router from "vue-router";
import Layout from "@/layout";
export const constantRouterMap = [
  {
    path: "/",
    redirect: "/video-manager",
    hidden: true,
  },
  {
    path: "/data-stats",
    component: Layout,
    meta: {
      navModule: "dataStats",
      title: "所有账号",
      sidebarLeaf: true,
      affix: true,
    },
    children: [
      {
        path: "",
        name: "账号数据",
        component: () => import("@/views/dataStats/index"),
        meta: { title: "所有账号" },
      },
    ],
  },

  {
    path: "/video-manager",
    component: Layout,
    redirect: "/video-manager",
    hidden: true,
    children: [
      {
        path: "/video-manager",
        name: "视频管理",
        component: () => import("@/views/videoManager/index"),
        meta: { noSlide: true, title: "视频管理" },
      },
    ],
  },
  {
    path: "*",
    component: () => import("@/views/404"),
    hidden: true,
  },
];

const createRouter = () =>
  new Router({
    scrollBehavior: () => ({ y: 0 }),
    routes: constantRouterMap,
  });

export function resetRouter() {
  const newRouter = createRouter();
  router.matcher = newRouter.matcher;
}
const router = createRouter();

export default router;
