import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CallLightning implements IAbility {
    private static instance: CallLightning;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Call Lightning";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help 'Call Lightning'
'CALL LIGHTNING'
CALL LIGHTNING
 
Syntax: cast 'call lightning'
 
This spell works only out of doors, and only when the weather is bad.
 
It calls down lightning bolts from the Gods.
 
See also - WEATHER CONTROL WEATHER
`;

        if (CallLightning.instance === undefined) {
            CallLightning.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CallLightning {
        if (!CallLightning.instance) {
            CallLightning.instance = new CallLightning();
        }
        return CallLightning.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CallLightning.GetInstance() as T;
    }
}

export default CallLightning;