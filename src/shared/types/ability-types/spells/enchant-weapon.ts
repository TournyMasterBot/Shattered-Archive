import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnchantWeapon implements IAbility {
    private static instance: EnchantWeapon;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Enchant Weapon";
        this.helpFile = `
help enchant weapon
'ENCHANT WEAPON'
'ENCHANT WEAPON'
Syntax: cast 'enchant weapon' <weapon>
This spell magically enchants a weapon, increasing its to-hit and to-dam
bonuses by one or two points. Multiple enchants may be cast, but as the
weapon grows more and more powerful, it is more likely to be drained or
destroyed by the magic. Also, every successful enchant increases the level
of the weapon by one...and there is no turning back.`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (EnchantWeapon.instance === undefined) {
            EnchantWeapon.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): EnchantWeapon {
        if (!EnchantWeapon.instance) {
            EnchantWeapon.instance = new EnchantWeapon();
        }
        return EnchantWeapon.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EnchantWeapon.GetInstance() as T;
    }
}

export default EnchantWeapon;