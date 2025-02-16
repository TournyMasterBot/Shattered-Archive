import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RestoreArmor implements IAbility {
    private static instance: RestoreArmor;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Restore Armor";
        this.helpFile = `
RESTORE ARMOR

Syntax: cast 'restore armor' <object>

The restore armor spell allows the enchantor to return a piece of armor to
its original state. The only requirement to restore an item is that its
current state has had an enchantment placed on it. It has been rumored
that attempts to restore a piece of armor may not have the desired effects,
so enchantors may wish to be wary.
        `;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (RestoreArmor.instance === undefined) {
            RestoreArmor.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): RestoreArmor {
        if (!RestoreArmor.instance) {
            RestoreArmor.instance = new RestoreArmor();
        }
        return RestoreArmor.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return RestoreArmor.GetInstance() as T;
    }
}

export default RestoreArmor;