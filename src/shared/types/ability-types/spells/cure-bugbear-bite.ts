import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureBugbearBite implements IAbility {
    private static instance: CureBugbearBite;

    name: string;
    manualDescription: string;
    alternateKeyword: string;
    recommendedHelpFileChanges: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cure Bugbear Bite";
        this.manualDescription = `
Casting this will cure bugbear bites, which cause negative status effects.
`;
        this.alternateKeyword = "bugbite";
        this.recommendedHelpFileChanges = "Include 'bugbear bite' as a keyword that can be used to search for this spell, bugbite isn't intuitive as the spell is listed as 'cure bugbear bite' in spells";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CureBugbearBite.instance === undefined) {
            CureBugbearBite.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CureBugbearBite {
        if (!CureBugbearBite.instance) {
            CureBugbearBite.instance = new CureBugbearBite();
        }
        return CureBugbearBite.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CureBugbearBite.GetInstance() as T;
    }
}

export default CureBugbearBite;