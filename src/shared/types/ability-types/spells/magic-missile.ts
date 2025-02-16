import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MagicMissile implements IAbility {
    private static instance: MagicMissile;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Magic Missile";
        this.helpFile = `
help 'Magic Missile'
'MAGIC MISSILE'
'MAGIC MISSILE'

Syntax: cast 'magic missile' <target>

One newly trained in the arts of magical combat learns this spell quickly in
their studies. The casting of magic missile provides the barest of
offensive abilities in magical combat.  

When cast, this spell appears before the target as a series of projectiles
of energy, flashing forth from the hands of the caster.  

See also - COMBAT 
        `;
        this.manualDescription = `
As this spell levels, it will cast additional projectiles. At level 15 you will be able to range this spell.
        `;
        this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
        this.abilityUsage = AbilityUsage.Active;

        if (MagicMissile.instance === undefined) {
            MagicMissile.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): MagicMissile {
        if (!MagicMissile.instance) {
            MagicMissile.instance = new MagicMissile();
        }
        return MagicMissile.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return MagicMissile.GetInstance() as T;
    }
}

export default MagicMissile;