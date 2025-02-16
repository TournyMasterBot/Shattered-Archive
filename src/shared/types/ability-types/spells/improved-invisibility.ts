import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ImprovedInvisibility implements IAbility {
    private static instance: ImprovedInvisibility;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Improved Invisibility";
        this.helpFile = `
IMPROVED INVISIBILITY
Improved invisibility is the same as invisibility except that the spell
stays active even after combat.  Only mages who study as Illusionists learn
this spell.
`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (ImprovedInvisibility.instance === undefined) {
            ImprovedInvisibility.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): ImprovedInvisibility {
        if (!ImprovedInvisibility.instance) {
            ImprovedInvisibility.instance = new ImprovedInvisibility();
        }
        return ImprovedInvisibility.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ImprovedInvisibility.GetInstance() as T;
    }
}

export default ImprovedInvisibility;