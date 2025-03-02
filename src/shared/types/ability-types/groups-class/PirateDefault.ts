import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ConcealedDagger from "@shared/types/ability-types/skills/ConcealedDagger";
import Intimidation from "@shared/types/ability-types/skills/Intimidation";
import Dropkick from "@shared/types/ability-types/skills/Dropkick";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import DualWield from "@shared/types/ability-types/skills/DualWield";
import Balance from "@shared/types/ability-types/skills/Balance";
import MortalShield from "@shared/types/ability-types/skills/MortalShield";
import DoubleParry from "@shared/types/ability-types/skills/DoubleParry";
import Hide from "@shared/types/ability-types/skills/Hide";
import GrenadeToss from "@shared/types/ability-types/skills/GrenadeToss";
import Pistol from "@shared/types/ability-types/skills/Pistol";
import Maingauche from "@shared/types/ability-types/skills/Maingauche";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import Parry from "@shared/types/ability-types/skills/Parry";
import ServerCache from "@shared/cache/server-cache";

export class PirateDefault implements IAbilityGroup {
  static instance: PirateDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.PirateDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ConcealedDagger.GetInstance(),
      Intimidation.GetInstance(),
      Dropkick.GetInstance(),
      Disarm.GetInstance(),
      DualWield.GetInstance(),
      Balance.GetInstance(),
      MortalShield.GetInstance(),
      DoubleParry.GetInstance(),
      Hide.GetInstance(),
      GrenadeToss.GetInstance(),
      Pistol.GetInstance(),
      Maingauche.GetInstance(),
      SecondAttack.GetInstance(),
      Sneak.GetInstance(),
      Parry.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PirateDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PirateDefault.GetInstance() as T;
  }
}

export default PirateDefault;
