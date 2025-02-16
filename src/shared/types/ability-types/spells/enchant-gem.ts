import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnchantGem implements IAbility {
    private static instance: EnchantGem;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Enchant Gem";
        this.helpFile = `
ENCHANT GEM

Syntax: cast 'enchant gem' <object>

Enchant gem allows the enchantor to magically enhance an ordinary jewel so
that it has the properties of a warp stone.`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (EnchantGem.instance === undefined) {
            EnchantGem.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): EnchantGem {
        if (!EnchantGem.instance) {
            EnchantGem.instance = new EnchantGem();
        }
        return EnchantGem.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EnchantGem.GetInstance() as T;
    }
}

export default EnchantGem;