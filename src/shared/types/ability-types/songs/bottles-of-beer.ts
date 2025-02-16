import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BottlesOfBeer implements IAbility {
    private static instance: BottlesOfBeer;

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
        this.name = "99 Bottles of Beer";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
99 Bottles of Beer - A fun and lively tune that summons forth a frosty 
mug of beer for any and all to drink.
`;
        this.manualDescription = "Places a bottle of beer in your inventory";
        
        if (BottlesOfBeer.instance === undefined) {
            BottlesOfBeer.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): BottlesOfBeer {
        if (!BottlesOfBeer.instance) {
            BottlesOfBeer.instance = new BottlesOfBeer();
        }
        return BottlesOfBeer.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return BottlesOfBeer.GetInstance() as T;
    }
}

export default BottlesOfBeer;