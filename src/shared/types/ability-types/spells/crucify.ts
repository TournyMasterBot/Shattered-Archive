import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Crucify implements IAbility {
    private static instance: Crucify;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Crucify";
        this.helpFile = `
help crucify
CRUCIFY
CRUCIFY

Syntax: c 'crucify' <target>

Crucification is the dedication of your enemy's corpse to your god. The
corpse must be emptied of all its worldly possessions before it can be
crucified. In return for your offering, energy of your deity flows through the
crucified corpse to enhance your weapons.

Crucified corpses cannot currently be taken down by any normal means.

See also - WORSHIP
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Crucify.instance === undefined) {
            Crucify.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Crucify {
        if (!Crucify.instance) {
            Crucify.instance = new Crucify();
        }
        return Crucify.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Crucify.GetInstance() as T;
    }
}

export default Crucify;