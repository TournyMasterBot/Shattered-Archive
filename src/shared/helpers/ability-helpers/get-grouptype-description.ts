import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import GroupTypeDescriptions from "@shared/types/ability-types/group-type-descriptions";

/**
    @usage
    ```
    const getAbilityGroupDescription = (group: AbilityGroup): string => {
        return abilityGroupDescriptions[group];
    }
    console.log(getAbilityGroupDescription(AbilityGroup.AnalyticalMind));
    ```
    @output
    ```
    "Analytical Mind"
    ```
 */
function GetGroupTypeDescription(type: AbilityGroupType): string {
    return GroupTypeDescriptions[type];
}

export default GetGroupTypeDescription;