import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ShieldStrike from "@shared/types/ability-types/skills/ShieldStrike";
import Polearm from "@shared/types/ability-types/skills/Polearm";
import Smite from "@shared/types/ability-types/skills/Smite";
import Riding from "@shared/types/ability-types/skills/Riding";
import ShieldBlock from "@shared/types/ability-types/skills/ShieldBlock";
import Charge from "@shared/types/ability-types/skills/Charge";
import Parry from "@shared/types/ability-types/skills/Parry";
import Attack from "../groups-spells/Attack";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Healing from "../groups-spells/Healing";
import Holy from "../groups-spells/Holy";
import Maladictions from "../groups-spells/Maladictions";
import ServerCache from "@shared/cache/server-cache";

export class PaladinDefault implements IAbilityGroup {
  static instance: PaladinDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.PaladinDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Healing.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Attack.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Holy.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ShieldStrike.GetInstance(),
      Polearm.GetInstance(),
      Smite.GetInstance(),
      Riding.GetInstance(),
      ShieldBlock.GetInstance(),
      Charge.GetInstance(),
      Parry.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PaladinDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PaladinDefault.GetInstance() as T;
  }
}

export default PaladinDefault;
