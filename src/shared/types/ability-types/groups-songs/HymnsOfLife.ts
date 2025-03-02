import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SongOfHealing from "@shared/types/ability-types/songs/SongOfHealing";
import TorchBurns from "@shared/types/ability-types/songs/TorchBurns";
import WakeTheDead from "@shared/types/ability-types/songs/WakeTheDead";
import MarriageSong from "@shared/types/ability-types/songs/MarriageSong";
import TravelTune from "@shared/types/ability-types/songs/TravelTune";
import BottlesOfBeer from "@shared/types/ability-types/songs/BottlesOfBeer";
import RevealAll from "@shared/types/ability-types/songs/RevealAll";
import SongOfPeace from "@shared/types/ability-types/songs/SongOfPeace";
import StoneFountain from "@shared/types/ability-types/songs/StoneFountain";
import ShieldOfWords from "@shared/types/ability-types/songs/ShieldOfWords";
import RoostersCrow from "@shared/types/ability-types/songs/RoostersCrow";
import ServerCache from "@shared/cache/server-cache";

export class HymnsOfLife implements IAbilityGroup {
  static instance: HymnsOfLife;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.HymnsOfLife;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilities = [
      SongOfHealing.GetInstance(),
      TorchBurns.GetInstance(),
      WakeTheDead.GetInstance(),
      MarriageSong.GetInstance(),
      TravelTune.GetInstance(),
      BottlesOfBeer.GetInstance(),
      RevealAll.GetInstance(),
      SongOfPeace.GetInstance(),
      StoneFountain.GetInstance(),
      ShieldOfWords.GetInstance(),
      RoostersCrow.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): HymnsOfLife {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HymnsOfLife.GetInstance() as T;
  }
}

export default HymnsOfLife;
