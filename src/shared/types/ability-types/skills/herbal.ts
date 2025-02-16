import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Herbal implements IAbility {
    private static instance: Herbal;

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
        this.name = "Herbal";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help Herbal
HERBS

Syntax: Herbs

Herbs or Herbal is skill available to the classes of Ranger, Druid, and
Shaman which allow them to look for herbs of healing and medicinal use to
store them for later use for themselves or others. Since herbs only grow in
certain regions, after all, not every place has much plant life but for
those who are in tune with nature, they know where to look for them.  

SEE ALSO: DRUID, RANGER, SHAMAN`;

        if (Herbal.instance === undefined) {
            Herbal.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Herbal {
        if (!Herbal.instance) {
            Herbal.instance = new Herbal();
        }
        return Herbal.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Herbal.GetInstance() as T;
    }
}

export default Herbal;