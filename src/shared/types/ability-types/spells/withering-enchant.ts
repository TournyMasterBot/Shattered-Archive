import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WitheringEnchant implements IAbility {
    private static instance: WitheringEnchant;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Withering Enchant";
        this.helpFile =
`WITHERING ENCHANT

Syntax: cast 'withering enchant' <object>

This spell allows an enchantor to magically wither an item so that it will
disintegrate when its bearer perishes.`;
        this.abilityGroupType = AbilityGroupType.Unknown; // Adjust if necessary
        this.abilityUsage = AbilityUsage.Active;

        if (WitheringEnchant.instance === undefined) {
            WitheringEnchant.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): WitheringEnchant {
        if (!WitheringEnchant.instance) {
            WitheringEnchant.instance = new WitheringEnchant();
        }
        return WitheringEnchant.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return WitheringEnchant.GetInstance() as T;
    }
}

export default WitheringEnchant;