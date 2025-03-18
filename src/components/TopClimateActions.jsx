import React, { useState } from "react";
import axios from "axios";
import { FiLoader } from "react-icons/fi";
import {
    getReductionPotential,
    isAdaptation,
    toTitleCase,
} from "../utils/helpers.js";
import PlanModal from "./PlanModal";
import { useTranslation } from "react-i18next";

const TopClimateActions = ({
    actions,
    type,
    setSelectedAction,
    selectedCity,
    setGeneratedPlan,
    generatedPlans,
    setGeneratedPlans,
}) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPrompt, setGeneratedPrompt] = useState("");
    const [localGeneratedPlan, setLocalGeneratedPlan] = useState("");
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

    const [isPlansListModalOpen, setIsPlansListModalOpen] = useState(false);

    const { t } = useTranslation();
    // Get top 3 actions of the specified type
    const topActions = actions
        .sort((a, b) => a.actionPriority - b.actionPriority)
        .slice(0, 3);

    const getProgressBars = (action) => {
        if (isAdaptation(type)) {
            const level = action?.AdaptationEffectiveness;
            const filledBars =
                level === "high" ? 3 : level === "medium" ? 2 : 1;
            const color =
                level === "high"
                    ? "bg-blue-500"
                    : level === "medium"
                      ? "bg-blue-400"
                      : "bg-blue-300";

            return Array(3)
                .fill()
                .map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 w-1/2 rounded ${i < filledBars ? color : "bg-gray-200"}`}
                    />
                ));
        } else {
            // Mitigation logic
            const potential = getReductionPotential(action);
            const potentialValue = potential
                ? parseInt(potential.split("-")[0])
                : 0; // Get the lower bound
            const getBarColor = (value) => {
                if (value >= 80) return "bg-blue-500"; // Very high
                if (value >= 60) return "bg-blue-400"; // High
                if (value >= 40) return "bg-blue-300"; // Medium
                if (value >= 20) return "bg-blue-200"; // Low
                return "bg-blue-100"; // Very low
            };

            const filledBars =
                potentialValue >= 80
                    ? 5
                    : potentialValue >= 60
                      ? 4
                      : potentialValue >= 40
                        ? 3
                        : potentialValue >= 20
                          ? 2
                          : 1;

            const color = getBarColor(potentialValue);

            return Array(5)
                .fill()
                .map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 w-1/3 rounded ${
                            i < filledBars ? color : "bg-gray-200"
                        }`}
                    />
                ));
        }
    };

    const generateActionPlan = async (action, type) => {
        setIsGenerating(true);
        try {
            const actionType = isAdaptation(type) ? "adaptation" : "mitigation";

            const payload = {
                action: action, // Send the entire action object as-is
                city_name: selectedCity, // Changed from 'city' to 'city_name'
            };

            console.log("Sending request to start plan creation:", {
                url: "/plan-api/start_plan_creation",
                payload,
            });

            // Step 1: Start plan creation and get task ID
            const startResponse = await fetch("/plan-api/start_plan_creation", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            });

            console.log(
                "Start plan creation response status:",
                startResponse.status,
            );
            console.log(
                "Start plan creation response headers:",
                Object.fromEntries(startResponse.headers.entries()),
            );

            // Log the raw response for debugging
            const responseText = await startResponse.text();
            console.log("Raw API Response:", responseText);

            if (!startResponse.ok) {
                throw new Error(
                    `Failed to start plan generation: ${responseText}`,
                );
            }

            let responseData;
            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse JSON response:", e);
                throw new Error(`Invalid JSON response: ${responseText}`);
            }

            const task_id = responseData.task_id;
            if (!task_id) {
                throw new Error(
                    `No task_id in response: ${JSON.stringify(responseData)}`,
                );
            }

            console.log(
                "Successfully started plan creation with task_id:",
                task_id,
            );

            // Step 2: Poll for completion
            let status = "pending";
            let attempts = 0;
            const maxAttempts = 30; // Maximum 30 attempts
            const pollInterval = 10000; // 10 seconds between attempts

            while (status === "pending" || status === "running") {
                console.log(
                    `Checking progress for task ${task_id}, attempt ${attempts + 1} of ${maxAttempts}`,
                );

                const statusResponse = await fetch(
                    `/plan-api/check_progress/${task_id}`,
                    {
                        headers: {
                            Accept: "application/json",
                        },
                    },
                );

                console.log(
                    "Check progress response status:",
                    statusResponse.status,
                );

                if (!statusResponse.ok) {
                    const errorText = await statusResponse.text();
                    console.error("Check progress error:", errorText);
                    throw new Error(`Failed to check progress: ${errorText}`);
                }

                const statusData = await statusResponse.json();
                console.log("Check progress response:", statusData);

                status = statusData.status;

                if (status === "failed") {
                    throw new Error(
                        statusData.error || "Plan generation failed",
                    );
                }

                if (status === "pending" || status === "running") {
                    if (attempts >= maxAttempts) {
                        throw new Error(
                            "Plan generation timed out after 5 minutes",
                        );
                    }
                    console.log(
                        `Waiting ${pollInterval / 1000} seconds before next check...`,
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, pollInterval),
                    ); // Poll every 10 seconds
                    attempts++;
                }
            }

            console.log(`Plan generation completed with status: ${status}`);

            // Step 3: Get the generated plan
            console.log(`Fetching plan for task ${task_id}`);

            const planResponse = await fetch(`/plan-api/get_plan/${task_id}`, {
                headers: {
                    Accept: "application/json",
                },
            });

            console.log("Get plan response status:", planResponse.status);

            if (!planResponse.ok) {
                const errorText = await planResponse.text();
                console.error("Get plan error:", errorText);
                throw new Error(`Failed to retrieve plan: ${errorText}`);
            }

            const plan = await planResponse.text();
            console.log("Successfully retrieved plan");

            // Update state with the generated plan
            const newPlan = {
                plan,
                timestamp: new Date().toISOString(),
                actionName: action?.ActionName,
            };
            setGeneratedPlans((prevPlans) => [...prevPlans, newPlan]);
            setLocalGeneratedPlan(plan);
            setGeneratedPlan(plan);
            setIsPlanModalOpen(true);
        } catch (error) {
            console.error("Error generating plan:", error);
            // Show error to user (you might want to add a toast or error state)
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-normal text-gray-900 font-poppins">
                {t(`top${type}ClimateActions`)}
            </h1>
            {/*Top Mitigatons Cards*/}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {topActions.map(({ action }, index) => (
                    /* Mitigation Card */
                    <div
                        key={index}
                        className={`p-6 space-y-4 border rounded-lg shadow-sm bg-white font-opensans ${
                            index === 0
                                ? "border-t-4 border-t-primary first-card ring-1 ring-blue-100"
                                : "shadow-sm"
                        }`}
                    >
                        {/*Index*/}
                        <div>
                            <span className="text-4xl font-bold text-gray-900 font-poppins">
                                {index + 1}°
                            </span>
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-gray-900 font-poppins">
                                {action?.ActionName}
                            </h2>
                            <p className="text-gray-600 text-md line-clamp-2 font-opensans">
                                {action?.Description}
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                            <div className="flex gap-2 ">
                                {getProgressBars(action)}
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-gray-600">
                                    {isAdaptation(type)
                                        ? t("adaptationPotential")
                                        : t("reductionPotential")}
                                </span>
                                <p className="text-gray-600 text-sm font-semibold line-clamp-2 font-opensans">
                                    {isAdaptation(type)
                                        ? toTitleCase(
                                              action?.AdaptationEffectiveness,
                                          )
                                        : getReductionPotential(action)}
                                </p>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">
                                    {t("sector")}
                                </span>
                                <span className="text-gray-600 font-semibold">
                                    {toTitleCase(
                                        action?.Sector || action?.Hazard,
                                    )}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">
                                    {t("estimatedCost")}
                                </span>
                                <span className="text-gray-600 font-semibold">
                                    {toTitleCase(action?.CostInvestmentNeeded)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">
                                    {t("implementationTime")}
                                </span>
                                <span className="text-gray-600 font-semibold">
                                    {action?.TimelineForImplementation}
                                </span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-between items-center pt-4">
                            <button
                                onClick={() => setSelectedAction(action)}
                                className="text-primary hover:text-primary-dark font-semibold"
                            >
                                {t("seeMoreDetails")}
                            </button>
                            <button
                                onClick={() => generateActionPlan(action, type)}
                                disabled={isGenerating}
                                className={`px-4 py-2 text-white font-semibold rounded-md transition-colors
                                    ${
                                        isGenerating
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-primary hover:bg-primary-dark"
                                    }`}
                            >
                                {isGenerating ? (
                                    <div className="flex items-center">
                                        <FiLoader className="animate-spin mr-2" />
                                        {t("generating")}
                                    </div>
                                ) : (
                                    t("generatePlan")
                                )}
                            </button>
                        </div>

                        {/* Modals */}
                        <PlanModal
                            isOpen={isPlanModalOpen}
                            onClose={() => setIsPlanModalOpen(false)}
                            plan={localGeneratedPlan}
                            plans={generatedPlans}
                            isListView={false}
                        />
                    </div>
                ))}
            </div>
            {generatedPlans.length > 0 && (
                <button
                    onClick={() => setIsPlansListModalOpen(true)}
                    className="mt-6 flex items-center gap-2 px-4 py-2 bg-white text-primary border border-primary rounded-lg font-semibold hover:bg-primary hover:text-white transition-colors"
                >
                    {t("seeGeneratedPlans")} ({generatedPlans.length})
                </button>
            )}
            <PlanModal
                isOpen={isPlansListModalOpen}
                onClose={() => setIsPlansListModalOpen(false)}
                plans={generatedPlans}
                isListView={true}
            />
        </div>
    );
};

export default TopClimateActions;
