import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Detection from "../groups-spells/detection";
import Bash from "@shared/types/ability-types/skills/bash";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Disarm from "@shared/types/ability-types/skills/disarm";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Headbutt from "@shared/types/ability-types/skills/headbutt";
import Parry from "@shared/types/ability-types/skills/parry";
import Possession from "@shared/types/ability-types/skills/possession";
import RagerCharge from "@shared/types/ability-types/skills/rager-charge";
import Rescue from "@shared/types/ability-types/skills/rescue";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import ShieldKick from "@shared/types/ability-types/skills/shield-kick";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";

export class BattleragerDefault implements IAbilityGroup {
    static instance: BattleragerDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.BattleragerDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...Detection.GetInstance().Get<Detection>().abilities,
            new SecondAttack(),
            new Disarm(),
            new Dagger(),
            new Headbutt(),
            new Possession(),
            new ThirdAttack(),
            new ShieldBlock(),
            new Rescue(),
            new ShieldKick(),
            new Bash(),
            new Parry(),
            new EnhancedDamage(),
            new RagerCharge()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): BattleragerDefault {
        if (!BattleragerDefault.instance) {
            BattleragerDefault.instance = new BattleragerDefault();
        }
        return BattleragerDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return BattleragerDefault.GetInstance() as T;
    }
}

export default BattleragerDefault;
