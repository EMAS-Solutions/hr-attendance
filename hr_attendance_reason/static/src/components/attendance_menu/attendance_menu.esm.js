/** @odoo-module */

import { ActivityMenu } from "@hr_attendance/components/attendance_menu/attendance_menu";
import { _t } from "@web/core/l10n/translation";
import { isIosApp } from "@web/core/browser/feature_detection";
import { patch } from "@web/core/utils/patch";
import { useRef, useState, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

patch(ActivityMenu.prototype, {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.attendance_reason = useRef("attendance_reason");
        this.state = useState({ ...this.state, loading: true });

        onWillStart(async () => {
            this.reasons = await this.getAttendanceReasons();
            this.state.loading = false;
        });
    },
    get defaultReasonId() {
        const action = this.state.checkedIn ? "sign_out" : "sign_in";
        return this.reasons?.find((r) => r.action_type === action)?.id;
    },
    async getAttendanceReasons() {
        this.reasons = [];
        await this.orm
            .call("hr.attendance.reason", "search_read", [], {
                fields: ["name", "action_type"],
                domain: [["show_on_attendance_screen", "=", true]],
            })
            .then((reasons) => {
                this.reasons = reasons;
            });
        return this.reasons;
    },
    async signInOut() {
        let attendance_reason_param = "";
        if (this.employee.show_reason_on_attendance_screen) {
            const attendance_reason_id = this.attendance_reason.el
                ? this.attendance_reason.el.value
                : "0";
            if (
                this.employee.required_reason_on_attendance_screen &&
                attendance_reason_id === "0"
            ) {
                this.notification.add(_t("An attendance reason is required!"), {
                    title: _t("Please, select a reason!"),
                    type: "danger",
                });
                return false;
            }
            attendance_reason_param =
                attendance_reason_id === "0" ? "" : attendance_reason_id;
        }
        // Fully override super method: the base implementation calls
        // `this.rpc(...)` directly, so we cannot let it proceed without our
        // extra `attendance_reason_id` param. Mirror the base flow here.
        document.body.click();
        if (!isIosApp()) {
            navigator.geolocation.getCurrentPosition(
                async ({ coords: { latitude, longitude } }) => {
                    await this.rpc("/hr_attendance/systray_check_in_out", {
                        latitude,
                        longitude,
                        attendance_reason_id: attendance_reason_param,
                    });
                    await this.searchReadEmployee();
                },
                async () => {
                    await this.rpc("/hr_attendance/systray_check_in_out", {
                        attendance_reason_id: attendance_reason_param,
                    });
                    await this.searchReadEmployee();
                },
                {
                    enableHighAccuracy: true,
                }
            );
        } else {
            await this.rpc("/hr_attendance/systray_check_in_out", {
                attendance_reason_id: attendance_reason_param,
            });
            await this.searchReadEmployee();
        }
    },
});
