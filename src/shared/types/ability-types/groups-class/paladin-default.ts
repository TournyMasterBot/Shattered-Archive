import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ShieldStrike from "@shared/types/ability-types/skills/shield-strike";
import Polearm from "@shared/types/ability-types/skills/polearm";
import Smite from "@shared/types/ability-types/skills/smite";
import Riding from "@shared/types/ability-types/skills/riding";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Charge from "@shared/types/ability-types/skills/charge";
import Parry from "@shared/types/ability-types/skills/parry";
import Attack from "../groups-spells/attack";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Healing from "../groups-spells/healing";
import Holy from "../groups-spells/holy";
import Maladictions from "../groups-spells/maladictions";

export class PaladinDefault implements IAbilityGroup {
    static instance: PaladinDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.PaladinDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...Healing.GetInstance().Get<Healing>().abilities,
            ...Benedictions.GetInstance().Get<Benedictions>().abilities,
            ...Attack.GetInstance().Get<Attack>().abilities,
            ...Curative.GetInstance().Get<Curative>().abilities,
            ...Holy.GetInstance().Get<Holy>().abilities,
            ...Maladictions.GetInstance().Get<Maladictions>().abilities,
            ShieldStrike.GetInstance().Get(),
            Polearm.GetInstance().Get(),
            Smite.GetInstance().Get(),
            Riding.GetInstance().Get(),
            ShieldBlock.GetInstance().Get(),
            Charge.GetInstance().Get(),
            Parry.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): PaladinDefault {
        if (!PaladinDefault.instance) {
            PaladinDefault.instance = new PaladinDefault();
        }
        return PaladinDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PaladinDefault.GetInstance() as T;
    }
}

export default PaladinDefault;
