import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Absorption from "@shared/types/ability-types/spells/absorption";
import InstantRegeneration from "@shared/types/ability-types/spells/instant-regeneration";
import EnhancedConstitution from "@shared/types/ability-types/spells/enhanced-constitution";
import Solidify from "@shared/types/ability-types/spells/solidify";
import AlterBeast from "@shared/types/ability-types/spells/alter-beast";
import Infuriate from "@shared/types/ability-types/spells/infuriate";
import AuraOfPain from "@shared/types/ability-types/spells/aura-of-pain";
import AncientVow from "@shared/types/ability-types/spells/ancient-vow";
import WindBreath from "@shared/types/ability-types/spells/wind-breath";
import Regenerate from "@shared/types/ability-types/spells/regenerate";

export class Battlemagic implements IAbilityGroup {
    static instance: Battlemagic;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Battlemagic;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            new Absorption(),
            new InstantRegeneration(),
            new EnhancedConstitution(),
            new Solidify(),
            new AlterBeast(),
            new Infuriate(),
            new AuraOfPain(),
            new AncientVow(),
            new WindBreath(),
            new Regenerate()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Battlemagic {
        if (!Battlemagic.instance) {
            Battlemagic.instance = new Battlemagic();
        }
        return Battlemagic.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Battlemagic.GetInstance() as T;
    }
}

export default Battlemagic;
